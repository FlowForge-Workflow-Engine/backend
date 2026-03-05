import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { generateUUID } from "@app/shared/utils/uuid.util";
import { TenantRepository } from "../repositories/tenant.repository";
import { TenantSettingsRepository } from "../repositories/tenant-settings.repository";
import { TenantFeatureFlagRepository } from "../repositories/tenant-feature-flag.repository";
import { Tenant } from "../entities/tenant.entity";
import { TenantSettings } from "../entities/tenant-settings.entity";
import { TenantFeatureFlag } from "../entities/tenant-feature-flag.entity";
import { TenantPublisher } from "../publishers/tenant.publisher";
import { CreateTenantDto } from "../dto/create-tenant.dto";
import { FindTenantDto } from "../dto/find-tenant.dto";
import { UpdateTenantDto } from "../dto/update-tenant.dto";
import { UpdateTenantSettingsDto } from "../dto/update-tenant-settings.dto";
import { CreateFeatureFlagDto } from "../dto/create-feature-flag.dto";
import { UpdateFeatureFlagDto } from "../dto/update-feature-flag.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

/**
 * Internal tenant management service — NOT exported from TenantModule.
 * Provides full CRUD operations for tenants, settings, and feature flags.
 * Consuming modules must use ITenantQueryContract via TENANT_QUERY_CONTRACT token.
 *
 * Responsibilities:
 * - Create, read, update, deactivate tenants
 * - Manage tenant settings (maxUsers, maxWorkflows, timezone, etc.)
 * - Manage feature flags (enable/disable features per tenant)
 * - Publish domain events (TENANT_CREATED, TENANT_DEACTIVATED, etc.)
 * - Invalidate caches on mutations
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly settingsRepository: TenantSettingsRepository,
    private readonly featureFlagRepository: TenantFeatureFlagRepository,
    private readonly publisher: TenantPublisher,
    private readonly redis: RedisService
  ) {}

  /**
   * Verifies that a user belongs to a tenant.
   * Used to prevent users from modifying tenants they don't belong to.
   *
   * @param tenantId - The tenant ID to verify
   * @param userTenantId - The user's tenant ID from JWT payload
   * @throws ForbiddenException - If user's tenant doesn't match the target tenant
   */
  verifyUserBelongsToTenant(tenantId: string, userTenantId: string): void {
    if (tenantId !== userTenantId) {
      throw new ForbiddenException(AppErrors.FORBIDDEN);
    }
  }

  /**
   * Creates a new tenant.
   * Validates slug uniqueness, creates tenant record, bootstraps default settings, and publishes event.
   *
   * @param dto - Tenant creation data (name, slug, plan)
   * @returns Promise<Tenant> - The created tenant entity
   * @throws ConflictException - If slug already exists
   */
  async create(dto: CreateTenantDto): Promise<Tenant> {
    const slugTaken = await this.tenantRepository.existsBySlug(dto.slug);
    if (slugTaken) throw new ConflictException(AppErrors.TENANT_SLUG_TAKEN);

    const tenant = this.tenantRepository.create({ ...dto, isActive: true });
    const saved = await this.tenantRepository.save(tenant);

    await this.settingsRepository.upsert(saved.id, {});

    this.publisher.publishTenantCreated({
      eventId: generateUUID(),
      tenantId: saved.id,
      name: saved.name,
      slug: saved.slug,
      plan: saved.plan,
      occurredAt: new Date().toISOString(),
    });

    this.logger.log(`Tenant created: ${saved.id} (slug=${saved.slug})`);
    return saved;
  }

  /**
   * Retrieves paginated tenants.
   *
   * @param dto - Pagination parameters
   * @returns Promise<Tenant[]> - Paginated tenants
   */
  findAll(dto: FindTenantDto): Promise<Tenant[]> {
    const { page, limit } = dto;
    return this.tenantRepository.findAll({ page, limit });
  }

  /**
   * Retrieves a single tenant by ID.
   *
   * @param id - The tenant ID
   * @returns Promise<Tenant> - The tenant entity
   * @throws NotFoundException - If tenant not found
   */
  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findById(id);
    if (!tenant) throw new NotFoundException(AppErrors.TENANT_NOT_FOUND);
    return tenant;
  }

  /**
   * Updates a tenant's properties.
   * Verifies user belongs to tenant, invalidates caches, and publishes events for plan changes or deactivation.
   *
   * @param id - The tenant ID to update
   * @param userTenantId - The user's tenant ID from JWT payload (for ownership verification)
   * @param dto - Partial tenant update data (name, plan, isActive, etc.)
   * @returns Promise<Tenant> - The updated tenant entity
   * @throws ForbiddenException - If user doesn't belong to the tenant
   * @throws NotFoundException - If tenant not found
   */
  async update(id: string, userTenantId: string, dto: UpdateTenantDto): Promise<Tenant> {
    this.verifyUserBelongsToTenant(id, userTenantId);
    const tenant = await this.findById(id);
    const oldPlan = tenant.plan;

    Object.assign(tenant, dto);
    const saved = await this.tenantRepository.save(tenant);

    // Invalidate tenant detail and plan caches on any update
    await this.redis.del(CacheKeys.tenantById(id), CacheKeys.tenantPlan(id));

    if (dto.plan && dto.plan !== oldPlan) {
      this.publisher.publishTenantPlanUpdated({
        eventId: generateUUID(),
        tenantId: id,
        oldPlan,
        newPlan: dto.plan,
        occurredAt: new Date().toISOString(),
      });
    }

    if (dto.isActive === false) {
      this.publisher.publishTenantDeactivated({
        eventId: generateUUID(),
        tenantId: id,
        occurredAt: new Date().toISOString(),
      });
    }

    return saved;
  }

  /**
   * Deactivates a tenant, preventing further access.
   * Verifies user belongs to tenant, invalidates caches, and publishes TENANT_DEACTIVATED event.
   *
   * @param id - The tenant ID to deactivate
   * @param userTenantId - The user's tenant ID from JWT payload (for ownership verification)
   * @returns Promise<Tenant> - The deactivated tenant entity
   * @throws ForbiddenException - If user doesn't belong to the tenant
   * @throws NotFoundException - If tenant not found
   */
  async deactivate(id: string, userTenantId: string): Promise<Tenant> {
    this.verifyUserBelongsToTenant(id, userTenantId);

    const tenant = await this.findById(id);

    tenant.isActive = false;
    const saved = await this.tenantRepository.save(tenant);

    await this.redis.del(CacheKeys.tenantById(id), CacheKeys.tenantPlan(id));

    this.publisher.publishTenantDeactivated({
      eventId: generateUUID(),
      tenantId: id,
      occurredAt: new Date().toISOString(),
    });

    this.logger.log(`Tenant deactivated: ${id}`);
    return saved;
  }

  /**
   * Retrieves tenant settings (maxUsers, maxWorkflows, timezone, etc.).
   * Creates default settings if they don't exist.
   *
   * @param tenantId - The tenant ID
   * @returns Promise<TenantSettings> - The tenant settings entity
   * @throws NotFoundException - If tenant not found
   */
  async getSettings(tenantId: string): Promise<TenantSettings> {
    await this.findById(tenantId);
    return this.settingsRepository.upsert(tenantId, {});
  }

  /**
   * Updates tenant settings.
   * Verifies user belongs to tenant and invalidates settings cache after update.
   *
   * @param tenantId - The tenant ID
   * @param userTenantId - The user's tenant ID from JWT payload (for ownership verification)
   * @param dto - Partial settings update data
   * @returns Promise<TenantSettings> - The updated settings entity
   * @throws ForbiddenException - If user doesn't belong to the tenant
   * @throws NotFoundException - If tenant not found
   */
  async updateSettings(
    tenantId: string,
    userTenantId: string,
    dto: UpdateTenantSettingsDto
  ): Promise<TenantSettings> {
    this.verifyUserBelongsToTenant(tenantId, userTenantId);

    await this.findById(tenantId);

    const result = await this.settingsRepository.upsert(tenantId, dto);

    await this.redis.del(CacheKeys.tenantSettings(tenantId));

    return result;
  }

  /**
   * Retrieves all feature flags for a tenant.
   *
   * @param tenantId - The tenant ID
   * @returns Promise<TenantFeatureFlag[]> - Array of feature flags
   * @throws NotFoundException - If tenant not found
   */
  async getFeatureFlags(tenantId: string): Promise<TenantFeatureFlag[]> {
    await this.findById(tenantId);
    return this.featureFlagRepository.findByTenantId(tenantId);
  }

  /**
   * Creates a new feature flag for a tenant.
   * Verifies user belongs to tenant, validates flag key uniqueness, and invalidates cache.
   *
   * @param tenantId - The tenant ID
   * @param userTenantId - The user's tenant ID from JWT payload (for ownership verification)
   * @param dto - Feature flag creation data (flagKey, isEnabled, config)
   * @returns Promise<TenantFeatureFlag> - The created feature flag
   * @throws ForbiddenException - If user doesn't belong to the tenant
   * @throws NotFoundException - If tenant not found
   * @throws ConflictException - If flag key already exists for this tenant
   */
  async createFeatureFlag(
    tenantId: string,
    userTenantId: string,
    dto: CreateFeatureFlagDto
  ): Promise<TenantFeatureFlag> {
    this.verifyUserBelongsToTenant(tenantId, userTenantId);

    await this.findById(tenantId);

    const existing = await this.featureFlagRepository.findByTenantIdAndKey(tenantId, dto.flagKey);

    if (existing) throw new ConflictException(`Feature flag '${dto.flagKey}' already exists for this tenant`);

    const flag = await this.featureFlagRepository.upsert(tenantId, dto.flagKey, {
      isEnabled: dto.isEnabled,
      config: dto.config ?? null,
    });

    await this.redis.del(CacheKeys.tenantFeatureFlags(tenantId));

    return flag;
  }

  /**
   * Updates an existing feature flag for a tenant.
   * Verifies user belongs to tenant and invalidates feature flags cache after update.
   *
   * @param tenantId - The tenant ID
   * @param userTenantId - The user's tenant ID from JWT payload (for ownership verification)
   * @param flagKey - The feature flag key to update
   * @param dto - Partial feature flag update data (isEnabled, config)
   * @returns Promise<TenantFeatureFlag> - The updated feature flag
   * @throws ForbiddenException - If user doesn't belong to the tenant
   * @throws NotFoundException - If tenant or flag not found
   */
  async updateFeatureFlag(
    tenantId: string,
    userTenantId: string,
    flagKey: string,
    dto: UpdateFeatureFlagDto
  ): Promise<TenantFeatureFlag> {
    this.verifyUserBelongsToTenant(tenantId, userTenantId);

    await this.findById(tenantId);

    const existing = await this.featureFlagRepository.findByTenantIdAndKey(tenantId, flagKey);

    if (!existing) throw new NotFoundException(AppErrors.FEATURE_FLAG_NOT_FOUND);

    const flag = await this.featureFlagRepository.upsert(tenantId, flagKey, dto);

    await this.redis.del(CacheKeys.tenantFeatureFlags(tenantId));

    return flag;
  }

  /**
   * Deletes a feature flag for a tenant.
   * Verifies user belongs to tenant and invalidates feature flags cache after deletion.
   *
   * @param tenantId - The tenant ID
   * @param userTenantId - The user's tenant ID from JWT payload (for ownership verification)
   * @param flagKey - The feature flag key to delete
   * @returns Promise<void>
   * @throws ForbiddenException - If user doesn't belong to the tenant
   * @throws NotFoundException - If tenant or flag not found
   */
  async deleteFeatureFlag(tenantId: string, userTenantId: string, flagKey: string): Promise<void> {
    this.verifyUserBelongsToTenant(tenantId, userTenantId);

    await this.findById(tenantId);

    const existing = await this.featureFlagRepository.findByTenantIdAndKey(tenantId, flagKey);

    if (!existing) throw new NotFoundException(AppErrors.FEATURE_FLAG_NOT_FOUND);

    await this.featureFlagRepository.remove(tenantId, flagKey);

    await this.redis.del(CacheKeys.tenantFeatureFlags(tenantId));
  }
}
