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

  async existsWithRole(userId: string, tenantId: string, role: string): Promise<boolean> {
    const summary = await this.findById(userId, tenantId);
    if (!summary) return false;
    return summary.roles.includes(role);
  }

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
