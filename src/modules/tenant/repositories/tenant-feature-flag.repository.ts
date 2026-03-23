import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TenantFeatureFlag } from "../entities/tenant-feature-flag.entity";
import { BaseRepository, RequestContextService } from "@app/database";

@Injectable()
export class TenantFeatureFlagRepository extends BaseRepository<TenantFeatureFlag> {
  constructor(
    @InjectRepository(TenantFeatureFlag)
    readonly entityRepo: Repository<TenantFeatureFlag>,
    readonly requestContext: RequestContextService
  ) {
    super(entityRepo, requestContext);
  }

  findByTenantId(tenantId: string): Promise<TenantFeatureFlag[]> {
    return this.repo.find({ where: { tenantId }, order: { flagKey: "ASC" } });
  }

  findByTenantIdAndKey(tenantId: string, flagKey: string): Promise<TenantFeatureFlag | null> {
    return this.repo.findOne({ where: { tenantId, flagKey } });
  }

  async isEnabled(tenantId: string, flagKey: string): Promise<boolean> {
    const flag = await this.findByTenantIdAndKey(tenantId, flagKey);
    return flag?.isEnabled ?? false;
  }

  async upsert(
    tenantId: string,
    flagKey: string,
    data: Partial<Pick<TenantFeatureFlag, "isEnabled" | "config">>
  ): Promise<TenantFeatureFlag> {
    let flag = await this.findByTenantIdAndKey(tenantId, flagKey);

    if (!flag) {
      flag = this.repo.create({ tenantId, flagKey, isEnabled: false, config: null, ...data });
    } else {
      Object.assign(flag, data);
    }

    return this.repo.save(flag);
  }

  async remove(tenantId: string, flagKey: string): Promise<void> {
    const flag = await this.findByTenantIdAndKey(tenantId, flagKey);
    if (flag) {
      await this.repo.remove(flag);
    }
  }
}
