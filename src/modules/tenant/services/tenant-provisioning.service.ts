import { ConflictException, Injectable, Logger } from "@nestjs/common";
import {
  ITenantProvisioningContract,
  TenantProvisioningResult,
} from "@app/shared/interfaces/contracts/tenant-provisioning.contract";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { TenantRepository } from "../repositories/tenant.repository";
import { TenantSettingsRepository } from "../repositories/tenant-settings.repository";
import { TenantPlan } from "../entities/tenant.entity";
import { RequestContextService } from "@app/database";

/**
 * Implements ITenantProvisioningContract — the write-side counterpart to TenantQueryService.
 * Only exposed via TENANT_PROVISIONING_CONTRACT symbol token; never directly imported.
 *
 * Responsibilities:
 *  - Validate slug uniqueness
 *  - Create the Tenant record
 *  - Bootstrap TenantSettings with safe defaults
 */
@Injectable()
export class TenantProvisioningService implements ITenantProvisioningContract {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly tenantSettingsRepository: TenantSettingsRepository,
    private readonly requestContext: RequestContextService
  ) {}

  /**
   * Provisions a new tenant during onboarding.
   * Validates slug uniqueness, creates tenant record, and bootstraps default settings.
   * Called exclusively by OnboardingService during tenant registration.
   *
   * @param dto - Provisioning data containing name, slug, and optional plan
   * @returns Promise<TenantProvisioningResult> - The provisioned tenant summary
   * @throws ConflictException - If slug already exists
   */
  async provision(dto: { name: string; slug: string; plan?: string }): Promise<TenantProvisioningResult> {
    const slugTaken = await this.tenantRepository.existsBySlug(dto.slug);
    if (slugTaken) {
      throw new ConflictException(AppErrors.TENANT_SLUG_TAKEN);
    }

    const tenant = this.tenantRepository.create({
      name: dto.name,
      slug: dto.slug,
      plan: (dto.plan as TenantPlan) ?? TenantPlan.FREE,
      isActive: true,
    });
    const saved = await this.tenantRepository.save(tenant);

    // ✅ Handle Special case for tenant provisioning / Tenant Onboarding
    // Manually set the tenant_id in the request context so that the RLS policies can see it.
    this.requestContext.setTenantId(saved.id);
    const queryRunner = this.requestContext.getQueryRunner();
    if (!queryRunner) {
      throw new Error("QueryRunner not set in request context");
    }
    await queryRunner.query(`SELECT set_config('app.tenant_id', $1::text, true)`, [saved.id]);

    // Bootstrap default tenant settings (maxUsers=50, maxWorkflows=10, timezone='UTC')
    await this.tenantSettingsRepository.upsert(saved.id, {});

    this.logger.log(`Tenant provisioned: ${saved.id} [slug=${saved.slug}]`);

    return {
      id: saved.id,
      name: saved.name,
      slug: saved.slug,
      plan: saved.plan,
    };
  }
}
