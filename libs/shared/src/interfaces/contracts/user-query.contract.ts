export const USER_QUERY_CONTRACT = Symbol("USER_QUERY_CONTRACT");

export interface UserSummary {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly roles: string[];
  readonly isActive: boolean;
}

export interface IUserQueryContract {
  /**
   * Find a user by their ID within a tenant.
   * @param userId - UUID of the user
   * @param tenantId - UUID of the tenant
   * @returns UserSummary or null if not found
   */
  findById(userId: string, tenantId: string): Promise<UserSummary | null>;

  /**
   * Find multiple users by IDs within a tenant.
   * @param userIds - Array of user UUIDs
   * @param tenantId - UUID of the tenant
   * @returns Array of UserSummary
   */
  findManyByIds(userIds: string[], tenantId: string): Promise<UserSummary[]>;

  /**
   * Check if a user has a specific role within a tenant.
   * @param userId - UUID of the user
   * @param tenantId - UUID of the tenant
   * @param role - Role name to check
   * @returns true if user has the role
   */
  existsWithRole(userId: string, tenantId: string, role: string): Promise<boolean>;
}
