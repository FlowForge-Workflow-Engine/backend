import { Column, Entity, Index, OneToMany } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";
import { UserRole } from "./user-role.entity";

/**
 * Role entity — scoped per tenant.
 * Extends BaseEntity → inherits id, tenantId (indexed), createdAt, updatedAt.
 * UNIQUE(tenantId, name) prevents duplicate role names within the same tenant.
 * isSystemRole=true roles (e.g. Admin, Viewer) cannot be deleted by tenants.
 */
@Entity("roles")
@Index(["tenantId", "name"], { unique: true })
export class Role extends BaseEntity {
  /** Role name - unique within tenant for role identification and assignment */
  @Column({ type: "varchar", length: 100 })
  name: string;

  /** Optional description explaining role purpose and permissions - helps with role management */
  @Column({ type: "varchar", length: 255, nullable: true })
  description: string | null;

  /** Flag indicating if role is system-defined - prevents deletion of core roles like Admin/Viewer */
  @Column({ type: "boolean", default: false, name: "is_system_role" })
  isSystemRole: boolean;

  /** One-to-many relationship with UserRole - enables navigation to users with this role */
  @OneToMany(() => UserRole, (ur) => ur.role)
  userRoles: UserRole[];
}
