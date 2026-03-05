import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

/**
 * 1:1 settings record per tenant.
 * tenant_id is UNIQUE (not a multi-row isolation key).
 * Does NOT extend BaseEntity — special case entity with no createdAt.
 */
@Entity('tenant_settings')
export class TenantSettings {
  /** Primary key - unique identifier for tenant settings record */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Foreign key to tenant - unique constraint ensures 1:1 relationship with tenant */
  @Index()
  @Column({ type: 'uuid', unique: true, nullable: false, name: 'tenant_id' })
  tenantId: string;

  /** One-to-one relationship with Tenant entity for data integrity */
  @OneToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** Maximum number of workflow definitions allowed for this tenant - enforces plan limits */
  @Column({ type: 'int', default: 10 })
  maxWorkflowDefinitions: number;

  /** Maximum number of users allowed for this tenant - enforces subscription limits */
  @Column({ type: 'int', default: 50 })
  maxUsers: number;

  /** Custom branding configuration (logos, colors, themes) - allows tenant customization */
  @Column({ type: 'jsonb', nullable: true })
  branding: Record<string, unknown> | null;

  /** Tenant's preferred timezone for date/time display - localizes user experience */
  @Column({ type: 'varchar', length: 50, default: 'UTC' })
  timezone: string;

  /** Timestamp of last settings update - tracks configuration changes */
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

