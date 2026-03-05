import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '@app/shared/entities/base.entity';

/**
 * Per-tenant feature flag rows.
 * Extends BaseEntity → inherits id, tenantId (indexed), createdAt, updatedAt.
 * UNIQUE(tenantId, flagKey) prevents duplicate flag keys per tenant.
 */
@Entity('tenant_feature_flags')
@Unique(['tenantId', 'flagKey'])
export class TenantFeatureFlag extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  flagKey: string;

  @Column({ type: 'boolean', default: false })
  isEnabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, unknown> | null;
}

