import { Injectable, Logger, NestMiddleware, HttpStatus } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { RedisService } from "../redis.service";
import { CacheKeys } from "../cache-keys";
import { CacheTTL } from "../cache-ttl";

interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    tenantId: string;
    roles?: string[];
  };
}

/**
 * Enhanced Rate Limiting Middleware with Leaky Bucket Algorithm
 *
 * Solves the noisy neighbor problem by:
 * 1. Per-tenant isolation using leaky bucket algorithm
 * 2. Smooth rate limiting (no thundering herd)
 * 3. Burst tolerance with sustained rate limits
 * 4. Atomic Redis operations using Lua scripts
 */
@Injectable()
export class EnhancedRateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(EnhancedRateLimitMiddleware.name);

  constructor(private readonly redis: RedisService) {}

  async use(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    // Skip unauthenticated requests — handled by JwtAuthGuard
    if (!req.user?.sub || !req.user?.tenantId) {
      next();
      return;
    }

    const { sub: userId, tenantId, roles = [] } = req.user;

    // Skip rate limiting for system admins
    if (roles.includes("SYSTEM_ADMIN")) {
      next();
      return;
    }

    try {
      // Check tenant-level rate limit (prevents tenant from overwhelming system)
      const tenantAllowed = await this.checkLeakyBucket(`wf-bucket:${tenantId}:tenant`, TENANT_BUCKET_CONFIG);

      if (!tenantAllowed.allowed) {
        this.logger.warn(`Tenant rate limit exceeded [tenantId=${tenantId}]`);
        this.sendRateLimitResponse(res, "Too many requests from your organization", tenantAllowed);
        return;
      }

      // Check user-level rate limit (prevents user from overwhelming tenant quota)
      const userAllowed = await this.checkLeakyBucket(
        `wf-bucket:${tenantId}:user:${userId}`,
        USER_BUCKET_CONFIG
      );

      if (!userAllowed.allowed) {
        this.logger.warn(`User rate limit exceeded [tenantId=${tenantId}, userId=${userId}]`);
        this.sendRateLimitResponse(res, "Too many requests", userAllowed);
        return;
      }

      // Add rate limit headers for client awareness
      this.addRateLimitHeaders(res, tenantAllowed, userAllowed);
      next();
    } catch (err) {
      // Fail-safe: Redis unavailable → pass through
      this.logger.warn("Enhanced rate limiting Redis error — passing through", err);
      next();
    }
  }

  /**
   * Check leaky bucket using atomic Lua script
   * Why Lua? Prevents race conditions in concurrent requests
   */
  private async checkLeakyBucket(bucketKey: string, config: BucketConfig): Promise<BucketResult> {
    try {
      const result = (await this.redis
        .getClient()
        .eval(
          LEAKY_BUCKET_LUA_SCRIPT,
          1,
          bucketKey,
          config.capacity.toString(),
          config.leakRate.toString(),
          Date.now().toString()
        )) as [number, number, number];

      const [allowed, remainingTokens, resetTime] = result;

      return {
        allowed: Boolean(allowed),
        remainingTokens,
        resetTime,
        limit: config.capacity,
      };
    } catch (error) {
      // Fail-safe: allow request if Redis fails
      return {
        allowed: true,
        remainingTokens: config.capacity,
        resetTime: Date.now() + 60000,
        limit: config.capacity,
      };
    }
  }

  private sendRateLimitResponse(res: Response, message: string, bucket: BucketResult): void {
    res.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message,
      retryAfter: Math.ceil((bucket.resetTime - Date.now()) / 1000),
    });
  }

  private addRateLimitHeaders(res: Response, tenant: BucketResult, user: BucketResult): void {
    // Most restrictive limit for standard headers
    const mostRestrictive = user.remainingTokens < tenant.remainingTokens ? user : tenant;

    res.setHeader("X-RateLimit-Limit", mostRestrictive.limit);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, mostRestrictive.remainingTokens));
    res.setHeader("X-RateLimit-Reset", new Date(mostRestrictive.resetTime).toISOString());

    // Detailed headers for debugging
    res.setHeader("X-RateLimit-Tenant-Remaining", Math.max(0, tenant.remainingTokens));
    res.setHeader("X-RateLimit-User-Remaining", Math.max(0, user.remainingTokens));
  }
}

// ─── Configuration ─────────────────────────────────────────────────────────

interface BucketConfig {
  capacity: number; // Burst capacity
  leakRate: number; // Tokens per second sustained rate
}

interface BucketResult {
  allowed: boolean;
  remainingTokens: number;
  resetTime: number;
  limit: number;
}

// Tenant: 1000 burst, 600/min sustained (10 tokens/sec)
const TENANT_BUCKET_CONFIG: BucketConfig = {
  capacity: 1000,
  leakRate: 10,
};

// User: 200 burst, 120/min sustained (2 tokens/sec)
const USER_BUCKET_CONFIG: BucketConfig = {
  capacity: 200,
  leakRate: 2,
};

// ─── Lua Script ───────────────────────────────────────────────────────────

/**
 * Atomic leaky bucket implementation
 * Returns: [allowed (0/1), remainingTokens, resetTime]
 */
const LEAKY_BUCKET_LUA_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local leak_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Get current bucket state
local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local current_tokens = tonumber(bucket[1]) or capacity
local last_refill = tonumber(bucket[2]) or now

-- Calculate tokens to leak based on time elapsed
local time_elapsed = (now - last_refill) / 1000
local tokens_to_leak = math.floor(time_elapsed * leak_rate)
current_tokens = math.max(0, current_tokens - tokens_to_leak)

-- Check if request is allowed
local allowed = 0
if current_tokens >= 1 then
  current_tokens = current_tokens - 1
  allowed = 1
end

-- Calculate reset time (when bucket will have capacity)
local reset_time = now + ((capacity - current_tokens) / leak_rate) * 1000

-- Update bucket state
redis.call('HMSET', key, 'tokens', current_tokens, 'last_refill', now)
redis.call('EXPIRE', key, 3600)  -- Expire after 1 hour

return {allowed, current_tokens, reset_time}
`;
