import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
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
import { UpdateTenantDto } from "../dto/update-tenant.dto";
import { UpdateTenantSettingsDto } from "../dto/update-tenant-settings.dto";
import { CreateFeatureFlagDto } from "../dto/create-feature-flag.dto";
import { UpdateFeatureFlagDto } from "../dto/update-feature-flag.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

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

  findAll(): Promise<Tenant[]> {
    return this.tenantRepository.findAll();
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findById(id);
    if (!tenant) throw new NotFoundException(AppErrors.TENANT_NOT_FOUND);
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
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

  async deactivate(id: string): Promise<Tenant> {
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

  async getSettings(tenantId: string): Promise<TenantSettings> {
    await this.findById(tenantId);
    return this.settingsRepository.upsert(tenantId, {});
  }

  async updateSettings(tenantId: string, dto: UpdateTenantSettingsDto): Promise<TenantSettings> {
    await this.findById(tenantId);
    const result = await this.settingsRepository.upsert(tenantId, dto);
    await this.redis.del(CacheKeys.tenantSettings(tenantId));
    return result;
  }

  async getFeatureFlags(tenantId: string): Promise<TenantFeatureFlag[]> {
    await this.findById(tenantId);
    return this.featureFlagRepository.findByTenantId(tenantId);
  }

  async createFeatureFlag(tenantId: string, dto: CreateFeatureFlagDto): Promise<TenantFeatureFlag> {
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

  async updateFeatureFlag(
    tenantId: string,
    flagKey: string,
    dto: UpdateFeatureFlagDto
  ): Promise<TenantFeatureFlag> {
    await this.findById(tenantId);
    const existing = await this.featureFlagRepository.findByTenantIdAndKey(tenantId, flagKey);
    if (!existing) throw new NotFoundException(AppErrors.FEATURE_FLAG_NOT_FOUND);
    const flag = await this.featureFlagRepository.upsert(tenantId, flagKey, dto);
    await this.redis.del(CacheKeys.tenantFeatureFlags(tenantId));
    return flag;
  }

  async deleteFeatureFlag(tenantId: string, flagKey: string): Promise<void> {
    await this.findById(tenantId);
    const existing = await this.featureFlagRepository.findByTenantIdAndKey(tenantId, flagKey);
    if (!existing) throw new NotFoundException(AppErrors.FEATURE_FLAG_NOT_FOUND);
    await this.featureFlagRepository.remove(tenantId, flagKey);
    await this.redis.del(CacheKeys.tenantFeatureFlags(tenantId));
  }
}
