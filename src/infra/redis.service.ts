import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { createRedisConfig } from "./redis.config";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const opts = createRedisConfig(this.configService);
    this.client = new Redis({
      host: opts.host,
      port: opts.port,
      password: opts.password,
      db: opts.db,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    this.client.on("error", (err) => this.logger.error("Redis error", err));
    this.client.on("connect", () => this.logger.log("Redis connected"));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => void 0);
  }

  /** Expose the underlying ioredis client (e.g. for health checks) */
  getClient(): Redis {
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`Redis GET failed [key=${key}]`, err);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialised = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.set(key, serialised, "EX", ttlSeconds);
      } else {
        await this.client.set(key, serialised);
      }
    } catch (err) {
      this.logger.warn(`Redis SET failed [key=${key}]`, err);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.client.del(...keys);
    } catch (err) {
      this.logger.warn(`Redis DEL failed [keys=${keys.join(",")}]`, err);
    }
  }

  /**
   * Delete all keys matching a glob pattern.
   * Uses SCAN to avoid blocking the Redis server.
   */
  async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = "0";
      do {
        const [next, keys] = await this.client.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = next;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== "0");
    } catch (err) {
      this.logger.warn(`Redis SCAN/DEL failed [pattern=${pattern}]`, err);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await this.client.exists(key)) === 1;
    } catch (err) {
      this.logger.warn(`Redis EXISTS failed [key=${key}]`, err);
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (err) {
      this.logger.warn(`Redis INCR failed [key=${key}]`, err);
      return 0;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis EXPIRE failed [key=${key}]`, err);
    }
  }

  /**
   * Atomic SET if Not eXists with TTL.
   * Returns true if the key was set (lock acquired), false if it already existed.
   */
  async setNX(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    try {
      const serialised = JSON.stringify(value);
      const result = await this.client.set(key, serialised, "EX", ttlSeconds, "NX");
      return result === "OK";
    } catch (err) {
      this.logger.warn(`Redis SETNX failed [key=${key}]`, err);
      return true; // fail-open: allow through if Redis is unavailable
    }
  }
}

