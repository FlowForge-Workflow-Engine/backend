import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export enum TenantPlan {
  FREE = "free",
  PRO = "pro",
  ENTERPRISE = "enterprise",
}

/**
 * Root tenant aggregate. This table has NO tenant_id column —
 * it IS the root of the tenant hierarchy.
 */
@Entity("tenants")
export class Tenant {
  /** Primary key - unique identifier for each tenant in the multi-tenant system */
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** Human-readable tenant name for display purposes and identification */
  @Column({ type: "varchar", length: 255 })
  name: string;

  /** URL-friendly unique identifier for tenant - used in subdomains and routing */
  @Column({ type: "varchar", length: 100, unique: true })
  slug: string;

  /** Subscription plan level - determines feature access and resource limits */
  @Column({ type: "enum", enum: TenantPlan, enumName: "tenant_plan_enum" })
  plan: TenantPlan;

  /** Soft delete flag - allows disabling tenant without data loss */
  @Column({ type: "boolean", default: true })
  isActive: boolean;

  /** Timestamp when tenant was created - for billing and analytics */
  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  /** Timestamp of last tenant update - tracks configuration changes */
  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
