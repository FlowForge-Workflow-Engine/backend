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
