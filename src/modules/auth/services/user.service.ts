import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { argon2hash } from "@app/shared/utils/hashes/argon2";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { generateUUID } from "@app/shared/utils/uuid.util";
import { UserRepository } from "../repositories/user.repository";
import { RoleRepository } from "../repositories/role.repository";
import { UserRoleRepository } from "../repositories/user-role.repository";
import { AuthPublisher } from "../publishers/auth.publisher";
import { User } from "../entities/user.entity";
import { CreateUserDto } from "../dto/create-user.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { FindUserDto } from "../dto/find-user.dto";

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
    private readonly userRoleRepository: UserRoleRepository,
    private readonly publisher: AuthPublisher,
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
    // TODO: Check if the actor is tenant admin or not, Only Tenant Admins can create other users.

    // Step 1: Validate email uniqueness within tenant (prevent duplicate accounts)
    const existing = await this.userRepository.findByEmailAndTenant(dto.email, tenantId);
    if (existing) throw new ConflictException(AppErrors.EMAIL_ALREADY_EXISTS);

    // Step 2: Hash password using Argon2 (memory-hard, resistant to GPU/ASIC attacks)
    const passwordHash = await argon2hash(dto.password);

    // Step 3: Create user entity with initial state (active, email not yet verified)
    const user = this.userRepository.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
      tenantId,
      isActive: true,
      isEmailVerified: false,
    });

    // Step 4: Persist user to database
    const saved = await this.userRepository.save(user);

    // Step 5: Assign initial roles if provided in request
    let roleNames: string[] = [];

    if (dto.roleNames?.length) {
      // Lookup roles by name within tenant (validates roles exist)
      const roles = await this.roleRepository.findByNames(dto.roleNames, tenantId);
      if (roles.length) {
        // Create user-role associations with audit trail (assignedBy)
        await this.userRoleRepository.assignMultipleRoles(
          saved.id,
          roles.map((role) => role.id),
          tenantId,
          actorId
        );
        roleNames = roles.map((r) => r.name);
      }
    }

    // Step 6: Publish USER_CREATED domain event for audit trail and downstream systems
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

    // Step 7: Invalidate tenant user list cache (new user added, list is stale)
    await this.redis.del(CacheKeys.usersByTenant(tenantId));

    // Step 8: Reload user with roles to return complete user data in response
    const userWithRoles = await this.userRepository.findByIdAndTenantWithRoles(saved.id, tenantId);

    // Step 9: Log creation for operational monitoring and debugging
    this.logger.log(`User created: ${saved.id} [tenant=${tenantId}]`);
    return userWithRoles || saved;
  }

  /**
   * Retrieves all users in a tenant.
   *
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<{ data: User[]; total: number }> - Current page data plus total tenant-scoped count
   */
  async findAll(dto: FindUserDto, tenantId: string): Promise<{ data: User[]; total: number }> {
    const { page, limit } = dto;
    const [data, total] = await this.userRepository.findByTenantIdWithRoles(tenantId, { page, limit });

    // Keep the page slice paired with the full match count so controllers can return true pagination metadata.
    return { data, total };
  }

  /**
   * Retrieves a single user by ID within a tenant with their assigned roles.
   * Uses explicit JOIN to load roles in a single query (no N+1 problem).
   *
   * @param id - The user ID to retrieve
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<User> - The user entity with roles populated
   * @throws NotFoundException - If user not found in the tenant
   */
  async findById(id: string, tenantId: string): Promise<User> {
    const user = await this.userRepository.findByIdAndTenantWithRoles(id, tenantId);
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

    const existing = await this.userRoleRepository.findExistingAssignment(userId, roleId);
    if (existing) throw new ConflictException("Role already assigned to this user");

    await this.userRoleRepository.assignRole(userId, roleId, tenantId, actorId);

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
