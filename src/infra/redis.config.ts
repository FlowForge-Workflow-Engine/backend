import { ConfigService } from "@nestjs/config";

/**
 * Parsed Redis connection options.
 * Use these options to construct an ioredis client:
 *   `new Redis(createRedisConfig(configService))`
 * Requires: `bun add ioredis` before use.
 */
export interface RedisConnectionOptions {
  /** Full Redis connection URL (e.g. redis://user:pass@host:6379) */
  readonly url: string;
  /** Hostname extracted from REDIS_URL */
  readonly host: string;
  /** Port extracted from REDIS_URL (default 6379) */
  readonly port: number;
  /** Password extracted from REDIS_URL (undefined if not set) */
  readonly password: string | undefined;
  /** Database index extracted from REDIS_URL path (default 0) */
  readonly db: number;
  /** Connection keep-alive in seconds */
  readonly keepAlive: number;
  /** Reconnect on error predicate */
  readonly lazyConnect: boolean;
}

/**
 * Parses `REDIS_URL` from ConfigService into a typed connection options object.
 * This factory is used by application modules that create an ioredis client.
 *
 * @param configService - NestJS ConfigService instance
 * @returns Typed Redis connection options
 */
export function createRedisConfig(configService: ConfigService): RedisConnectionOptions {
  const redisUrl = configService.get<string>("REDIS_URL", "redis://localhost:6379");
  const parsed = new URL(redisUrl);

  const dbPath = parsed.pathname.replace(/^\//, "");
  const db = dbPath ? parseInt(dbPath, 10) : 0;

  return {
    url: redisUrl,
    host: parsed.hostname || "localhost",
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    password: parsed.password || undefined,
    db: isNaN(db) ? 0 : db,
    keepAlive: 10,
    lazyConnect: false,
  };
}

/**
 * Returns the Redis URL string only.
 * Useful for cache-manager or BullMQ which accept a URL directly.
 *
 * @param configService - NestJS ConfigService instance
 * @returns Redis connection URL string
 */
export function getRedisUrl(configService: ConfigService): string {
  return configService.get<string>("REDIS_URL", "redis://localhost:6379");
}
