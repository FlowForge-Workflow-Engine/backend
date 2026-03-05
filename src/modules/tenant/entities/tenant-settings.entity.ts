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
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', unique: true, nullable: false, name: 'tenant_id' })
  tenantId: string;

  @OneToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'int', default: 10 })
  maxWorkflowDefinitions: number;

  @Column({ type: 'int', default: 50 })
  maxUsers: number;

  @Column({ type: 'jsonb', nullable: true })
  branding: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 50, default: 'UTC' })
  timezone: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

