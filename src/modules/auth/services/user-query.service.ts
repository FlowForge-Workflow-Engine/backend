import { Injectable } from "@nestjs/common";
import { IUserQueryContract, UserSummary } from "@app/shared/interfaces/contracts/user-query.contract";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";
import { UserRepository } from "../repositories/user.repository";

/**
 * Implements IUserQueryContract — the ONLY service exported from AuthModule.
 * Provides a thin, read-only facade over user data for cross-module consumption.
 * Returns only UserSummary — never exposes the full User entity.
 *
 * Cache-aside: user summaries are cached in Redis with MEDIUM TTL.
 * Invalidation is handled by UserService on write operations.
 */
@Injectable()
export class UserQueryService implements IUserQueryContract {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly redis: RedisService
  ) {}

  /**
   * Retrieves a user summary by ID with cache-aside pattern.
   * Returns only non-sensitive user data (no password hash).
   * Caches result in Redis with MEDIUM TTL.
   *
   * @param userId - The user ID to retrieve
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<UserSummary | null> - User summary or null if not found
   */
  async findById(userId: string, tenantId: string): Promise<UserSummary | null> {
    const key = CacheKeys.userSummary(tenantId, userId);
    const cached = await this.redis.get<UserSummary>(key);
    if (cached) return cached;

    const user = await this.userRepository.findByIdWithRoles(userId, tenantId);
    if (!user) return null;

    const summary = this.toSummary(user);
    await this.redis.set(key, summary, CacheTTL.MEDIUM);
    return summary;
  }

  /**
   * Retrieves multiple user summaries by IDs with cache-aside pattern.
   * Checks cache first, then queries database for cache misses.
   * Populates cache for newly fetched users.
   *
   * @param userIds - Array of user IDs to retrieve
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<UserSummary[]> - Array of user summaries (may be smaller if some users not found)
   */
  async findManyByIds(userIds: string[], tenantId: string): Promise<UserSummary[]> {
    const results: UserSummary[] = [];
    const missedIds: string[] = [];

    for (const userId of userIds) {
      const cached = await this.redis.get<UserSummary>(CacheKeys.userSummary(tenantId, userId));
      if (cached) {
        results.push(cached);
      } else {
        missedIds.push(userId);
      }
    }

    if (missedIds.length) {
      const users = await this.userRepository.findManyByIds(missedIds, tenantId);
      for (const user of users) {
        const summary = this.toSummary(user);
        await this.redis.set(CacheKeys.userSummary(tenantId, user.id), summary, CacheTTL.MEDIUM);
        results.push(summary);
      }
    }

    return results;
  }

  /**
   * Checks if a user exists and has a specific role.
   * Uses findById internally, so benefits from caching.
   *
   * @param userId - The user ID to check
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param role - The role name to check for
   * @returns Promise<boolean> - True if user exists and has the role, false otherwise
   */
  async existsWithRole(userId: string, tenantId: string, role: string): Promise<boolean> {
    const summary = await this.findById(userId, tenantId);
    if (!summary) return false;
    return summary.roles.includes(role);
  }

  /**
   * Converts a full User entity to a UserSummary (read-only facade).
   * Extracts only non-sensitive fields and role names.
   *
   * @param user - The full user entity
   * @returns UserSummary - Sanitized user summary for cross-module consumption
   */
  private toSummary(user: import("../entities/user.entity").User): UserSummary {
    const roles = user.userRoles?.map((ur) => ur.role?.name).filter(Boolean) ?? [];
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      roles,
      isActive: user.isActive,
    };
  }
}
