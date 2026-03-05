import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Permission entity — system-level catalogue, NOT tenant-scoped.
 * No tenant_id column — permissions are shared across all tenants.
 * Rows are seeded at deploy time (e.g. workflow:create, workflow:approve).
 */
@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The resource being protected (e.g. 'workflow', 'user') */
  @Column({ type: 'varchar', length: 100 })
  resource: string;

  /** The action being performed (e.g. 'create', 'read', 'update', 'delete', 'approve') */
  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

