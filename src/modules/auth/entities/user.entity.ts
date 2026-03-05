import { Column, Entity, Index, OneToMany } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";
import { UserRole } from "./user-role.entity";

/**
 * User entity — scoped per tenant.
 * Extends BaseEntity → inherits id, tenantId (indexed), createdAt, updatedAt.
 * UNIQUE(tenantId, email) prevents duplicate emails within the same tenant.
 */
@Entity("users")
@Index(["tenantId", "email"], { unique: true })
export class User extends BaseEntity {
  @Column({ type: "varchar", length: 255 })
  email: string;

  @Column({ type: "varchar", length: 255, name: "password_hash" })
  passwordHash: string;

  @Column({ type: "varchar", length: 100, name: "first_name" })
  firstName: string;

  @Column({ type: "varchar", length: 100, name: "last_name" })
  lastName: string;

  @Column({ type: "boolean", default: true, name: "is_active" })
  isActive: boolean;

  @Column({ type: "boolean", default: false, name: "is_email_verified" })
  isEmailVerified: boolean;

  @Column({ type: "timestamptz", nullable: true, name: "last_login_at" })
  lastLoginAt: Date | null;

  @OneToMany(() => UserRole, (ur) => ur.user)
  userRoles: UserRole[];
}
