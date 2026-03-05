import { Injectable, Logger, NestMiddleware, HttpStatus } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { RedisService } from "../redis.service";
import { CacheKeys } from "../cache-keys";
import { CacheTTL } from "../cache-ttl";
import {
  RATE_LIMIT_PER_USER_PER_MINUTE,
  RATE_LIMIT_PER_TENANT_PER_MINUTE,
} from "../rate-limit.constants";

interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    tenantId: string;
  };
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  constructor(private readonly redis: RedisService) {}

  async use(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    // Skip unauthenticated requests — handled by JwtAuthGuard
    if (!req.user?.sub || !req.user?.tenantId) {
      next();
      return;
    }

    const { sub: userId, tenantId } = req.user;
    const windowMin = Math.floor(Date.now() / 60_000);

    const userKey = CacheKeys.rateLimitUser(tenantId, userId, windowMin);
    const tenantKey = CacheKeys.rateLimitTenant(tenantId, windowMin);

    try {
      const [userCount, tenantCount] = await Promise.all([
        this.redis.incr(userKey),
        this.redis.incr(tenantKey),
      ]);

      // Set expiry only on first increment (TTL = 2 windows to avoid race)
      if (userCount === 1) await this.redis.expire(userKey, CacheTTL.RATE_LIMIT * 2);
      if (tenantCount === 1) await this.redis.expire(tenantKey, CacheTTL.RATE_LIMIT * 2);

      if (userCount > RATE_LIMIT_PER_USER_PER_MINUTE) {
        this.logger.warn(`User rate limit exceeded [userId=${userId}, tenantId=${tenantId}]`);
        res.status(HttpStatus.TOO_MANY_REQUESTS).json({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Too many requests — user rate limit exceeded",
        });
        return;
      }

      if (tenantCount > RATE_LIMIT_PER_TENANT_PER_MINUTE) {
        this.logger.warn(`Tenant rate limit exceeded [tenantId=${tenantId}]`);
        res.status(HttpStatus.TOO_MANY_REQUESTS).json({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Too many requests — tenant rate limit exceeded",
        });
        return;
      }
    } catch (err) {
      // Fail-safe: Redis unavailable → pass through
      this.logger.warn("RateLimitMiddleware Redis error — passing through", err);
    }

    next();
  }
}

