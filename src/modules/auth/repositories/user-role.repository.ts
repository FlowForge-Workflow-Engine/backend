import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserRole } from "../entities/user-role.entity";
import { BaseRepository, RequestContextService } from "@app/database";

/**
 * Repository for UserRole entity operations.
 * Handles user-role assignments with tenant isolation and audit trail.
 */
@Injectable()
export class UserRoleRepository extends BaseRepository<UserRole> {
  constructor(
    @InjectRepository(UserRole) readonly entityRepo: Repository<UserRole>,
    readonly requestContext: RequestContextService
  ) {
    super(entityRepo, requestContext);
  }

  /**
   * Creates a new user-role assignment entity (without persisting).
   * Used for preparing role assignments before batch operations.
   *
   * @param data - UserRole data (userId, roleId, tenantId, assignedBy)
   * @returns UserRole - The created entity instance
   */
  createUserRole(data: {
    userId: string;
    roleId: string;
    tenantId: string;
    assignedBy: string | null;
  }): UserRole {
    return this.repo.create({
      userId: data.userId,
      roleId: data.roleId,
      tenantId: data.tenantId,
      assignedBy: data.assignedBy,
    });
  }

  /**
   * Assigns a single role to a user.
   * Creates and persists the user-role assignment with audit trail.
   *
   * @param userId - The user ID to assign the role to
   * @param roleId - The role ID to assign
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param assignedBy - The user ID of the actor performing the assignment (for audit trail)
   * @returns Promise<UserRole> - The created and saved user-role assignment
   */
  async assignRole(
    userId: string,
    roleId: string,
    tenantId: string,
    assignedBy: string | null
  ): Promise<UserRole> {
    const userRole = this.createUserRole({ userId, roleId, tenantId, assignedBy });

    return this.repo.save(userRole);
  }

  /**
   * Assigns multiple roles to a user in a single transaction.
   * Creates and persists multiple user-role assignments with audit trail.
   *
   * @param userId - The user ID to assign roles to
   * @param roleIds - Array of role IDs to assign
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param assignedBy - The user ID of the actor performing the assignments (for audit trail)
   * @returns Promise<UserRole[]> - The created and saved user-role assignments
   */
  async assignMultipleRoles(
    userId: string,
    roleIds: string[],
    tenantId: string,
    assignedBy: string | null
  ): Promise<UserRole[]> {
    const userRoles = roleIds.map((roleId) => this.createUserRole({ userId, roleId, tenantId, assignedBy }));
    return this.repo.save(userRoles);
  }

  /**
   * Checks if a specific role is already assigned to a user.
   * Used to prevent duplicate role assignments.
   *
   * @param userId - The user ID to check
   * @param roleId - The role ID to check
   * @returns Promise<UserRole | null> - The existing assignment or null if not found
   */
  async findExistingAssignment(userId: string, roleId: string): Promise<UserRole | null> {
    return this.repo.findOne({ where: { userId, roleId } });
  }

  /**
   * Finds all role assignments for a specific user within a tenant.
   * Used for loading user permissions and role information.
   *
   * @param userId - The user ID to find assignments for
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<UserRole[]> - Array of user-role assignments with role details
   */
  async findByUserAndTenant(userId: string, tenantId: string): Promise<UserRole[]> {
    return this.repo.find({
      where: { userId, tenantId },
      relations: ["role"],
      order: { assignedAt: "ASC" },
    });
  }

  /**
   * Finds all users assigned to a specific role within a tenant.
   * Used for role-based queries and permission management.
   *
   * @param roleId - The role ID to find assignments for
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<UserRole[]> - Array of user-role assignments with user details
   */
  async findByRoleAndTenant(roleId: string, tenantId: string): Promise<UserRole[]> {
    return this.repo.find({
      where: { roleId, tenantId },
      relations: ["user"],
      order: { assignedAt: "ASC" },
    });
  }

  /**
   * Removes a role assignment from a user.
   * Used for role revocation and permission management.
   *
   * @param userId - The user ID to remove the role from
   * @param roleId - The role ID to remove
   * @returns Promise<void>
   */
  async removeRoleAssignment(userId: string, roleId: string): Promise<void> {
    await this.repo.delete({ userId, roleId });
  }

  /**
   * Removes all role assignments for a user within a tenant.
   * Used when deactivating users or cleaning up permissions.
   *
   * @param userId - The user ID to remove all roles from
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<void>
   */
  async removeAllUserRoles(userId: string, tenantId: string): Promise<void> {
    await this.repo.delete({ userId, tenantId });
  }

  /**
   * Counts the number of users assigned to a specific role within a tenant.
   * Used for role usage analytics and permission auditing.
   *
   * @param roleId - The role ID to count assignments for
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<number> - The count of users with this role
   */
  async countUsersByRole(roleId: string, tenantId: string): Promise<number> {
    return this.repo.count({ where: { roleId, tenantId } });
  }
}
