import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TenantSettings } from "../entities/tenant-settings.entity";

@Injectable()
export class TenantSettingsRepository {
  constructor(
    @InjectRepository(TenantSettings)
    private readonly repo: Repository<TenantSettings>
  ) {}

  findByTenantId(tenantId: string): Promise<TenantSettings | null> {
    return this.repo.findOne({ where: { tenantId } });
  }

  /**
   * Creates or updates the settings record for a tenant.
   * On first call (tenant just created) it bootstraps defaults.
   */
  async upsert(tenantId: string, data: Partial<TenantSettings>): Promise<TenantSettings> {
    let settings = await this.findByTenantId(tenantId);

    if (!settings) {
      settings = this.repo.create({
        tenantId,
        maxWorkflowDefinitions: 10,
        maxUsers: 50,
        branding: null,
        timezone: "UTC",
        ...data,
      });
    } else {
      Object.assign(settings, data);
    }

    return this.repo.save(settings);
  }
}
