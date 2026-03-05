import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Pattern 3 — Shadow Read Model for the Workflow Execution module.
 *
 * This table is a local copy of Auth-domain user data, kept in sync
 * via NATS events (USER_CREATED, USER_DEACTIVATED, USER_ROLES_UPDATED).
 *
 * Allows high-frequency joins within execution queries WITHOUT
 * cross-module database coupling or cross-service RPC calls.
 *
 * Table prefix `we_` marks it as owned by workflow-execution.
 */
@Entity("we_user_shadows")
export class WeUserShadow {
  /** Mirrors users.id — not auto-generated, set from event payload - maintains referential consistency */
  @PrimaryColumn({ type: "uuid" })
  id: string;

  /** Tenant isolation for shadow data - ensures user shadows are scoped to tenant */
  @Index()
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId: string;

  /** Cached user email from auth domain - enables local queries without cross-service calls */
  @Column({ type: "varchar", length: 255 })
  email: string;

  /** Cached full name for display purposes - avoids repeated auth service lookups */
  @Column({ type: "varchar", length: 255, name: "full_name" })
  fullName: string;

  /** Role names (not IDs) — synced from IUserRolesUpdatedEvent.roles - enables role-based queries */
  @Column({ type: "varchar", array: true, default: "{}" })
  roles: string[];

  /** Cached active status - tracks user availability for workflow operations */
  @Column({ type: "boolean", name: "is_active", default: true })
  isActive: boolean;

  /** Timestamp of last sync — useful for lag detection - tracks data freshness */
  @Column({ type: "timestamptz", name: "synced_at" })
  syncedAt: Date;
}
