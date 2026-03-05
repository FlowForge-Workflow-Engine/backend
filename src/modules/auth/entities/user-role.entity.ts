import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { User } from "./user.entity";
import { Role } from "./role.entity";

/**
 * Join table between User and Role within a tenant.
 * Composite PK (userId, roleId) prevents duplicate assignments.
 * assignedBy records the actor UUID who performed the assignment (audit trail).
 */
@Entity("user_roles")
@Index(["userId", "roleId"], { unique: true })
export class UserRole {
  /** Foreign key to User - part of composite primary key for many-to-many relationship */
  @PrimaryColumn({ type: "uuid", name: "user_id" })
  userId: string;

  /** Foreign key to Role - part of composite primary key for many-to-many relationship */
  @PrimaryColumn({ type: "uuid", name: "role_id" })
  roleId: string;

  /** Tenant isolation - ensures role assignments are scoped to specific tenant */
  @Index()
  @Column({ type: "uuid", nullable: false, name: "tenant_id" })
  tenantId: string;

  /** Many-to-one relationship with User entity - enables navigation to user details */
  @ManyToOne(() => User, (u) => u.userRoles, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  /** Many-to-one relationship with Role entity - enables navigation to role details */
  @ManyToOne(() => Role, (r) => r.userRoles, { onDelete: "CASCADE" })
  @JoinColumn({ name: "role_id" })
  role: Role;

  /** UUID of the user or system that assigned this role - audit trail for role assignments */
  @Column({ type: "uuid", nullable: true, name: "assigned_by" })
  assignedBy: string | null;

  /** Timestamp when role was assigned - tracks role assignment history */
  @CreateDateColumn({ type: "timestamptz", name: "assigned_at" })
  assignedAt: Date;
}
