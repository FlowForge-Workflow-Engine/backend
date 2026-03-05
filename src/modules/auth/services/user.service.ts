import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { argon2hash } from "@app/shared/utils/hashes/argon2";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { generateUUID } from "@app/shared/utils/uuid.util";
import { UserRepository } from "../repositories/user.repository";
import { RoleRepository } from "../repositories/role.repository";
import { AuthPublisher } from "../publishers/auth.publisher";
import { User } from "../entities/user.entity";
import { UserRole } from "../entities/user-role.entity";
import { CreateUserDto } from "../dto/create-user.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

/**
 * Internal user management service — NOT exported from AuthModule.
 * Consuming modules must use IUserQueryContract via USER_QUERY_CONTRACT token.
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly publisher: AuthPublisher,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    private readonly redis: RedisService
  ) {}

  /**
   * Creates a new user within a tenant.
   * Hashes the password, assigns initial roles, publishes USER_CREATED event, and invalidates caches.
   *
   * @param dto - User creation data (email, password, firstName, lastName, roleNames)
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param actorId - The user ID of the actor performing the creation (for audit trail)
   * @returns Promise<User> - The created user entity
   * @throws ConflictException - If email already exists in the tenant
   */
  async create(dto: CreateUserDto, tenantId: string, actorId: string): Promise<User> {
    const existing = await this.userRepository.findByEmailAndTenant(dto.email, tenantId);
    if (existing) throw new ConflictException(AppErrors.EMAIL_ALREADY_EXISTS);

    const passwordHash = await argon2hash(dto.password);
    const user = this.userRepository.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
      tenantId,
      isActive: true,
      isEmailVerified: false,
    });
    const saved = await this.userRepository.save(user);

    let roleNames: string[] = [];

    if (dto.roleNames?.length) {
      const roles = await this.roleRepository.findByNames(dto.roleNames, tenantId);
      if (roles.length) {
        const userRoles = roles.map((role) =>
          this.userRoleRepo.create({ userId: saved.id, roleId: role.id, assignedBy: actorId })
        );
        await this.userRoleRepo.save(userRoles);
        roleNames = roles.map((r) => r.name);
      }
    }

    this.publisher.publishUserCreated({
      eventId: generateUUID(),
      tenantId,
      userId: saved.id,
      email: saved.email,
      firstName: saved.firstName,
      lastName: saved.lastName,
      roles: roleNames,
      occurredAt: new Date().toISOString(),
    });

    // Invalidate tenant user list so it refreshes on next read
    await this.redis.del(CacheKeys.usersByTenant(tenantId));

    this.logger.log(`User created: ${saved.id} [tenant=${tenantId}]`);
    return saved;
  }

  /**
   * Retrieves all users in a tenant.
   *
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<User[]> - Array of all users in the tenant
   */
  async findAll(tenantId: string): Promise<User[]> {
    return this.userRepository.findByTenantId(tenantId);
  }

  /**
   * Retrieves a single user by ID within a tenant.
   *
   * @param id - The user ID to retrieve
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<User> - The user entity
   * @throws NotFoundException - If user not found in the tenant
   */
  async findById(id: string, tenantId: string): Promise<User> {
    const user = await this.userRepository.findByIdAndTenant(id, tenantId);
    if (!user) throw new NotFoundException(AppErrors.USER_NOT_FOUND);
    return user;
  }

  /**
   * Deactivates a user, preventing them from logging in.
   * Invalidates all user-related caches and publishes USER_DEACTIVATED event.
   *
   * @param id - The user ID to deactivate
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<User> - The deactivated user entity
   * @throws NotFoundException - If user not found in the tenant
   */
  async deactivate(id: string, tenantId: string): Promise<User> {
    const user = await this.findById(id, tenantId);
    user.isActive = false;
    const saved = await this.userRepository.save(user);

    // Invalidate all caches that contain this user's data
    await this.redis.del(
      CacheKeys.userSummary(tenantId, id),
      CacheKeys.userRoles(tenantId, id),
      CacheKeys.jwtUser(tenantId, id),
      CacheKeys.usersByTenant(tenantId)
    );

    this.publisher.publishUserDeactivated({
      eventId: generateUUID(),
      tenantId,
      userId: id,
      occurredAt: new Date().toISOString(),
    });

    return saved;
  }

  /**
   * Assigns a role to a user.
   * Validates both user and role exist, prevents duplicate assignments, invalidates caches, and publishes event.
   *
   * @param userId - The user ID to assign the role to
   * @param roleId - The role ID to assign
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param actorId - The user ID of the actor performing the assignment (for audit trail)
   * @returns Promise<void>
   * @throws NotFoundException - If user or role not found in the tenant
   * @throws ConflictException - If role is already assigned to the user
   */
  async assignRole(userId: string, roleId: string, tenantId: string, actorId: string): Promise<void> {
    await this.findById(userId, tenantId);
    const role = await this.roleRepository.findByIdAndTenant(roleId, tenantId);
    if (!role) throw new NotFoundException(AppErrors.ROLE_NOT_FOUND);

    const existing = await this.userRoleRepo.findOne({ where: { userId, roleId } });
    if (existing) throw new ConflictException("Role already assigned to this user");

    const userRole = this.userRoleRepo.create({ userId, roleId, assignedBy: actorId });
    await this.userRoleRepo.save(userRole);

    // Invalidate user-level caches so roles are refreshed on next read
    await this.redis.del(
      CacheKeys.userSummary(tenantId, userId),
      CacheKeys.userRoles(tenantId, userId),
      CacheKeys.jwtUser(tenantId, userId)
    );

    const userWithRoles = await this.userRepository.findByIdWithRoles(userId, tenantId);
    const roleNames = userWithRoles?.userRoles?.map((ur) => ur.role?.name).filter(Boolean) ?? [];

    this.publisher.publishUserRolesUpdated({
      eventId: generateUUID(),
      tenantId,
      userId,
      roles: roleNames,
      occurredAt: new Date().toISOString(),
    });
  }
}
