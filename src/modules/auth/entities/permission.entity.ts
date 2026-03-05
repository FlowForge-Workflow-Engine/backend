import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * Permission entity — system-level catalogue, NOT tenant-scoped.
 * No tenant_id column — permissions are shared across all tenants.
 * Rows are seeded at deploy time (e.g. workflow:create, workflow:approve).
 */
@Entity("permissions")
export class Permission {
  /** Primary key - unique identifier for each permission in the system */
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** The resource being protected (e.g. 'workflow', 'user') - categorizes what is being accessed */
  @Column({ type: "varchar", length: 100 })
  resource: string;

  /** The action being performed (e.g. 'create', 'read', 'update', 'delete', 'approve') - defines what operation is allowed */
  @Column({ type: "varchar", length: 100 })
  action: string;

  /** Optional description explaining the permission - helps with permission management */
  @Column({ type: "varchar", length: 255, nullable: true })
  description: string | null;

  /** Timestamp when permission was created - tracks system permission setup */
  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
