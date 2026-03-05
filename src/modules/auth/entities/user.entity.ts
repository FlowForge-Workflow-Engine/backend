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
  /** User's email address - unique within tenant for authentication and communication */
  @Column({ type: "varchar", length: 255 })
  email: string;

  /** Hashed password for authentication - never store plain text passwords */
  @Column({ type: "varchar", length: 255, name: "password_hash" })
  passwordHash: string;

  /** User's first name - for personalization and display purposes */
  @Column({ type: "varchar", length: 100, name: "first_name" })
  firstName: string;

  /** User's last name - for personalization and display purposes */
  @Column({ type: "varchar", length: 100, name: "last_name" })
  lastName: string;

  /** Flag indicating if user account is active - allows soft deletion/deactivation */
  @Column({ type: "boolean", default: true, name: "is_active" })
  isActive: boolean;

  /** Flag indicating if user's email has been verified - security and communication validation */
  @Column({ type: "boolean", default: false, name: "is_email_verified" })
  isEmailVerified: boolean;

  /** Timestamp of user's last login - tracks user activity and engagement */
  @Column({ type: "timestamptz", nullable: true, name: "last_login_at" })
  lastLoginAt: Date | null;

  /** One-to-many relationship with UserRole - enables navigation to user's roles */
  @OneToMany(() => UserRole, (ur) => ur.user)
  userRoles: UserRole[];
}
