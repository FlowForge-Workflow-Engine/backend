import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '@app/shared/entities/base.entity';
import { UserRole } from './user-role.entity';

/**
 * Role entity — scoped per tenant.
 * Extends BaseEntity → inherits id, tenantId (indexed), createdAt, updatedAt.
 * UNIQUE(tenantId, name) prevents duplicate role names within the same tenant.
 * isSystemRole=true roles (e.g. Admin, Viewer) cannot be deleted by tenants.
 */
@Entity('roles')
@Index(['tenantId', 'name'], { unique: true })
export class Role extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_system_role' })
  isSystemRole: boolean;

  @OneToMany(() => UserRole, (ur) => ur.role)
  userRoles: UserRole[];
}

