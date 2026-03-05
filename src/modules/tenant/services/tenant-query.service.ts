import { Injectable } from "@nestjs/common";
import { ITenantQueryContract, TenantSummary } from "@app/shared/interfaces/contracts/tenant-query.contract";
import { TenantRepository } from "../repositories/tenant.repository";
import { TenantFeatureFlagRepository } from "../repositories/tenant-feature-flag.repository";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";

/**
 * Implements ITenantQueryContract — the ONLY service exported from TenantModule.
 * Provides a thin, read-only facade over tenant data for cross-module consumption.
 * Returns only TenantSummary — never exposes the full Tenant entity.
 *
 * On microservice extraction: swap this class for a gRPC client implementation.
 * Consuming modules (AuthModule, WorkflowModule, etc.) depend only on the Symbol
 * token + ITenantQueryContract interface, so they require zero changes.
 */
@Injectable()
export class TenantQueryService implements ITenantQueryContract {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly featureFlagRepository: TenantFeatureFlagRepository,
    private readonly redis: RedisService
  ) {}

  /**
   * Retrieves a tenant summary by ID using cache-aside pattern.
   * Returns only essential tenant data (id, name, slug, plan, isActive).
   * Caches result with MEDIUM TTL for performance.
   *
   * @param tenantId - The tenant ID to retrieve
   * @returns Promise<TenantSummary | null> - Tenant summary or null if not found
   */
  async findById(tenantId: string): Promise<TenantSummary | null> {
    const key = CacheKeys.tenantById(tenantId);
    const cached = await this.redis.get<TenantSummary>(key);
    if (cached) return cached;

    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) return null;

    const summary: TenantSummary = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      isActive: tenant.isActive,
    };
    await this.redis.set(key, summary, CacheTTL.MEDIUM);
    return summary;
  }

  /**
   * Retrieves a tenant summary by slug using cache-aside pattern.
   * Used for tenant lookup during onboarding and login flows.
   * Caches result with MEDIUM TTL for performance.
   *
   * @param slug - The tenant slug to retrieve
   * @returns Promise<TenantSummary | null> - Tenant summary or null if not found
   */
  async findBySlug(slug: string): Promise<TenantSummary | null> {
    const key = CacheKeys.tenantBySlug(slug);
    const cached = await this.redis.get<TenantSummary>(key);
    if (cached) return cached;

    const tenant = await this.tenantRepository.findBySlug(slug);
    if (!tenant) return null;

    const summary: TenantSummary = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      isActive: tenant.isActive,
    };
    await this.redis.set(key, summary, CacheTTL.MEDIUM);
    return summary;
  }

  /**
   * Checks if a feature flag is enabled for a tenant.
   * Loads all flags for the tenant and caches them as a map for efficient lookups.
   * Returns false if flag doesn't exist (safe default).
   *
   * @param tenantId - The tenant ID
   * @param flagKey - The feature flag key to check
   * @returns Promise<boolean> - true if flag is enabled, false otherwise
   */
  async isFeatureEnabled(tenantId: string, flagKey: string): Promise<boolean> {
    const key = CacheKeys.tenantFeatureFlags(tenantId);
    const cached = await this.redis.get<Record<string, boolean>>(key);
    if (cached) return cached[flagKey] ?? false;

    // Cache miss — load all flags as a map and cache together
    const flags = await this.featureFlagRepository.findByTenantId(tenantId);
    const flagMap = Object.fromEntries(flags.map((f) => [f.flagKey, f.isEnabled]));
    await this.redis.set(key, flagMap, CacheTTL.SHORT);
    return flagMap[flagKey] ?? false;
  }

  /**
   * Retrieves the plan for a tenant using cache-aside pattern.
   * Returns "free" as default if tenant not found.
   * Caches result with MEDIUM TTL for performance.
   *
   * @param tenantId - The tenant ID
   * @returns Promise<string> - The tenant's plan (e.g., "free", "pro", "enterprise")
   */
  async getPlan(tenantId: string): Promise<string> {
    const key = CacheKeys.tenantPlan(tenantId);
    const cached = await this.redis.get<string>(key);
    if (cached) return cached;

    const tenant = await this.tenantRepository.findById(tenantId);
    const plan = tenant?.plan ?? "free";
    await this.redis.set(key, plan, CacheTTL.MEDIUM);
    return plan;
  }
}
