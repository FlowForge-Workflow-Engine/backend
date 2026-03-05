import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  TENANT_PROVISIONING_CONTRACT,
  ITenantProvisioningContract,
} from "@app/shared/interfaces/contracts/tenant-provisioning.contract";
import {
  TENANT_QUERY_CONTRACT,
  ITenantQueryContract,
} from "@app/shared/interfaces/contracts/tenant-query.contract";
import { argon2hash } from "@app/shared/utils/hashes/argon2";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { generateUUID } from "@app/shared/utils/uuid.util";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { UserRepository } from "../repositories/user.repository";
import { RoleRepository } from "../repositories/role.repository";
import { AuthService } from "./auth.service";
import { AuthPublisher } from "../publishers/auth.publisher";
import { UserRole } from "../entities/user-role.entity";
import { RegisterTenantDto } from "../dto/register-tenant.dto";
import { RegisterDto } from "../dto/register.dto";

const DEFAULT_SYSTEM_ROLES = [
  { name: "Admin", description: "Full access to all tenant resources", isSystemRole: true },
  { name: "Approver", description: "Can approve or reject workflow transitions", isSystemRole: true },
  { name: "Requestor", description: "Can initiate and track workflow instances", isSystemRole: true },
] as const;

export interface OnboardingTokenResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  tenant?: { id: string; name: string; slug: string };
}

/**
 * Orchestrates both public registration flows.
 * Only injects contract tokens from TenantModule — never TenantService/TenantRepository directly.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject(TENANT_PROVISIONING_CONTRACT)
    private readonly tenantProvisioning: ITenantProvisioningContract,
    @Inject(TENANT_QUERY_CONTRACT)
    private readonly tenantQuery: ITenantQueryContract,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    private readonly authService: AuthService,
    private readonly publisher: AuthPublisher,
    private readonly redis: RedisService
  ) {}

  /** POST /auth/register/tenant — full company onboarding */
  async registerTenant(dto: RegisterTenantDto): Promise<OnboardingTokenResult> {
    const lockKey = `register:tenant:${dto.tenantSlug}`;
    const acquired = await this.redis.setNX(lockKey, "1", 60);
    if (!acquired) throw new ConflictException("Registration in progress — please try again");

    try {
      const tenant = await this.tenantProvisioning.provision({
        name: dto.tenantName,
        slug: dto.tenantSlug,
        plan: "free",
      });

      // Seed the 3 default system roles
      const roleEntities = DEFAULT_SYSTEM_ROLES.map((r) =>
        this.roleRepository.create({ ...r, tenantId: tenant.id })
      );
      const savedRoles = await this.roleRepository.saveMany(roleEntities);

      // Create the founding admin user
      const existing = await this.userRepository.findByEmailAndTenant(dto.email, tenant.id);
      if (existing) throw new ConflictException(AppErrors.EMAIL_ALREADY_EXISTS);

      const passwordHash = await argon2hash(dto.password);
      const user = this.userRepository.create({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        tenantId: tenant.id,
        isActive: true,
        isEmailVerified: false,
      });
      const savedUser = await this.userRepository.save(user);

      // Assign Admin role
      const adminRole = savedRoles.find((r) => r.name === "Admin");
      if (adminRole) {
        const userRole = this.userRoleRepo.create({
          userId: savedUser.id,
          roleId: adminRole.id,
          tenantId: tenant.id,
          assignedBy: savedUser.id,
        });
        await this.userRoleRepo.save(userRole);
      }

      this.publisher.publishUserCreated({
        eventId: generateUUID(),
        tenantId: tenant.id,
        userId: savedUser.id,
        email: savedUser.email,
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
        roles: adminRole ? ["Admin"] : [],
        occurredAt: new Date().toISOString(),
      });

      const tokens = await this.authService.issueTokenPair(
        savedUser.id,
        savedUser.email,
        savedUser.firstName,
        tenant.id,
        adminRole ? ["Admin"] : []
      );

      this.logger.log(`Company registered: tenant=${tenant.id}, admin=${savedUser.id}`);
      return {
        ...tokens,
        user: {
          id: savedUser.id,
          email: savedUser.email,
          firstName: savedUser.firstName,
          lastName: savedUser.lastName,
        },
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  /** POST /auth/register — employee self-registration under an existing tenant */
  async registerUser(dto: RegisterDto): Promise<OnboardingTokenResult> {
    const lockKey = `register:user:${dto.email}:${dto.tenantSlug}`;
    const acquired = await this.redis.setNX(lockKey, "1", 60);
    if (!acquired) throw new ConflictException("Registration in progress — please try again");

    try {
      const tenant = await this.tenantQuery.findBySlug(dto.tenantSlug);
      if (!tenant) throw new NotFoundException(AppErrors.TENANT_NOT_FOUND);
      if (!tenant.isActive) throw new ForbiddenException(AppErrors.TENANT_INACTIVE);

      const existing = await this.userRepository.findByEmailAndTenant(dto.email, tenant.id);
      if (existing) throw new ConflictException(AppErrors.EMAIL_ALREADY_EXISTS);

      const passwordHash = await argon2hash(dto.password);
      const user = this.userRepository.create({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        tenantId: tenant.id,
        isActive: true,
        isEmailVerified: false,
      });
      const savedUser = await this.userRepository.save(user);

      const requestorRole = await this.roleRepository.findByNameAndTenant("Requestor", tenant.id);
      let roleNames: string[] = [];
      if (requestorRole) {
        const userRole = this.userRoleRepo.create({
          userId: savedUser.id,
          roleId: requestorRole.id,
          tenantId: tenant.id,
          assignedBy: null,
        });
        await this.userRoleRepo.save(userRole);
        roleNames = ["Requestor"];
      }

      this.publisher.publishUserCreated({
        eventId: generateUUID(),
        tenantId: tenant.id,
        userId: savedUser.id,
        email: savedUser.email,
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
        roles: roleNames,
        occurredAt: new Date().toISOString(),
      });

      await this.redis.del(CacheKeys.usersByTenant(tenant.id));

      const tokens = await this.authService.issueTokenPair(
        savedUser.id,
        savedUser.email,
        savedUser.firstName,
        tenant.id,
        roleNames
      );
      this.logger.log(`User self-registered: user=${savedUser.id} [tenant=${tenant.id}]`);
      return {
        ...tokens,
        user: {
          id: savedUser.id,
          email: savedUser.email,
          firstName: savedUser.firstName,
          lastName: savedUser.lastName,
        },
      };
    } finally {
      await this.redis.del(lockKey);
    }
  }
}
