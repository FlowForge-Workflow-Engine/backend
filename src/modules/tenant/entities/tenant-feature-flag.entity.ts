import { Column, Entity, Unique } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";

/**
 * Per-tenant feature flag rows.
 * Extends BaseEntity → inherits id, tenantId (indexed), createdAt, updatedAt.
 * UNIQUE(tenantId, flagKey) prevents duplicate flag keys per tenant.
 */
@Entity("tenant_feature_flags")
@Unique(["tenantId", "flagKey"])
export class TenantFeatureFlag extends BaseEntity {
  /** Unique identifier for the feature flag - allows feature toggling per tenant */
  @Column({ type: "varchar", length: 100 })
  flagKey: string;

  /** Boolean flag indicating if feature is enabled for this tenant - controls feature access */
  @Column({ type: "boolean", default: false })
  isEnabled: boolean;

  /** Additional configuration data for the feature - allows complex feature customization */
  @Column({ type: "jsonb", nullable: true })
  config: Record<string, unknown> | null;
}
