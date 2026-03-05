import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

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
@Entity('we_user_shadows')
export class WeUserShadow {
  /** Mirrors users.id — not auto-generated, set from event payload. */
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  fullName: string;

  /** Role names (not IDs) — synced from IUserRolesUpdatedEvent.roles */
  @Column({ type: 'varchar', array: true, default: '{}' })
  roles: string[];

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  /** Timestamp of last sync — useful for lag detection. */
  @Column({ type: 'timestamptz', name: 'synced_at' })
  syncedAt: Date;
}

