import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  TENANT_PROVISIONING_CONTRACT,
  ITenantProvisioningContract,
} from "@app/shared/interfaces/contracts/tenant-provisioning.contract";
import {
  INotificationTemplateBootstrapContract,
  NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT,
} from "@app/shared/interfaces/contracts/notification-template-bootstrap.contract";
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
import { UserRoleRepository } from "../repositories/user-role.repository";
import { AuthService } from "./auth.service";
import { AuthPublisher } from "../publishers/auth.publisher";
import { RegisterTenantDto } from "../dto/register-tenant.dto";
import { RegisterDto } from "../dto/register.dto";
import { DEFAULT_SYSTEM_ROLES } from "../constants/default-system-roles";

/**
 * Result of a successful onboarding flow (tenant or user registration).
 * Contains authentication tokens and user/tenant information.
 */
export interface OnboardingTokenResult {
  /** JWT access token for API authentication */
  accessToken: string;
  /** Opaque refresh token for token rotation */
  refreshToken: string;
  /** Created user information */
  user: { id: string; email: string; firstName: string; lastName: string };
  /** Created tenant information (only present in tenant registration flow) */
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
    @Inject(NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT)
    private readonly notificationTemplateBootstrap: INotificationTemplateBootstrapContract,
    @Inject(TENANT_QUERY_CONTRACT)
    private readonly tenantQuery: ITenantQueryContract,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly userRoleRepository: UserRoleRepository,
    private readonly authService: AuthService,
    private readonly publisher: AuthPublisher,
    private readonly redis: RedisService
  ) {}

  /**
   * Registers a new tenant and its founding admin user (full company onboarding).
   * Uses distributed lock to prevent concurrent registrations of the same tenant slug.
   * Provisions tenant, seeds default system roles, creates admin user, and issues tokens.
   *
   * @param dto - Tenant and admin user registration data
   * @returns Promise<OnboardingTokenResult> - Tokens and created tenant/user info
   * @throws ConflictException - If tenant slug already exists or registration is in progress
   */
  async registerTenant(dto: RegisterTenantDto): Promise<OnboardingTokenResult> {
    const lockKey = `register:tenant:${dto.tenantSlug}`;
    const acquired = await this.redis.setNX(lockKey, "1", 60);
    if (!acquired) throw new ConflictException("Registration in progress — please try again");

    try {
      // Provision/Create the tenant record and default settings
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
        await this.userRoleRepository.assignRole(savedUser.id, adminRole.id, tenant.id, savedUser.id);
      }

      // Bootstrap the tenant-scoped welcome template before publishing tenant.created so the first
      // onboarding event can be resolved immediately by NotificationSubscriber without manual setup.
      await this.notificationTemplateBootstrap.ensureTenantCreatedWelcomeTemplate(tenant.id);

      // Publish tenant.created only after the founding admin exists so notification subscribers can send the
      // onboarding welcome email without making any cross-module recipient lookup.
      this.publisher.publishTenantCreated({
        eventId: generateUUID(),
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        adminUserId: savedUser.id,
        adminEmail: savedUser.email,
        adminFirstName: savedUser.firstName,
        adminLastName: savedUser.lastName,
        occurredAt: new Date().toISOString(),
      });

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
        tenant.slug,
        adminRole ? ["Admin"] : [],
        adminRole ? [adminRole.id] : [],
        tenant.plan
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

  /**
   * Registers a new user under an existing tenant (employee self-registration).
   * Uses distributed lock to prevent concurrent registrations of the same email.
   * Validates tenant is active, creates user with Requestor role, and issues tokens.
   *
   * @param dto - User registration data (email, password, firstName, lastName, tenantSlug)
   * @returns Promise<OnboardingTokenResult> - Tokens and created user info
   * @throws NotFoundException - If tenant not found
   * @throws ForbiddenException - If tenant is inactive
   * @throws ConflictException - If email already exists or registration is in progress
   */
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
        await this.userRoleRepository.assignRole(savedUser.id, requestorRole.id, tenant.id, null);
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
        tenant.slug,
        roleNames,
        requestorRole ? [requestorRole.id] : [],
        tenant.plan
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
