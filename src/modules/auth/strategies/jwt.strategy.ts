import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";
import { UserRepository } from "../repositories/user.repository";

interface CachedJwtUser {
  isActive: boolean;
  roleIds: string[];
}

/**
 * Validates JWT Bearer tokens.
 * On success, populates req.user with the full IJwtPayload.
 * The JwtAuthGuard (global) delegates to this strategy for non-public routes.
 *
 * Cache-aside: user active status is cached with SHORT TTL so deactivated users
 * are blocked within 1 minute without hitting the DB on every request.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    configService: ConfigService,
    private readonly redis: RedisService,
    private readonly userRepository: UserRepository
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET", "change-me-in-env"),
    });
  }

  /**
   * Called by Passport after the token signature is verified.
   * Checks user active status via Redis cache (falls back to DB on miss).
   * Also backfills role IDs for older tokens that were issued before roleIds
   * became part of the JWT payload.
   * Return value is attached to req.user.
   */
  async validate(payload: IJwtPayload): Promise<IJwtPayload> {
    if (!payload.sub || !payload.tenantId) {
      throw new UnauthorizedException("Invalid token payload");
    }

    const cacheKey = CacheKeys.jwtUser(payload.tenantId, payload.sub);
    let cached = await this.redis.get<CachedJwtUser>(cacheKey);

    if (!cached || !Array.isArray(cached.roleIds)) {
      const user = await this.userRepository.findByIdAndTenantWithRoles(payload.sub, payload.tenantId);
      if (!user) throw new UnauthorizedException("User not found");
      cached = {
        isActive: user.isActive,
        roleIds: user.userRoles?.map((ur) => ur.roleId).filter(Boolean) ?? [],
      };
      await this.redis.set(cacheKey, cached, CacheTTL.SHORT);
    }

    if (!cached.isActive) {
      throw new UnauthorizedException("User account is deactivated");
    }

    return {
      ...payload,
      roleIds: Array.isArray(payload.roleIds) ? payload.roleIds : cached.roleIds,
    };
  }
}
