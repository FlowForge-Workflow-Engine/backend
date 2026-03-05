import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditActionType {
  INSTANCE_CREATED = 'instance_created',
  TRANSITION_EXECUTED = 'transition_executed',
  INSTANCE_CANCELLED = 'instance_cancelled',
}

/**
 * Immutable append-only audit record.
 *
 * Design constraints:
 *  - NO updatedAt column — records are write-once.
 *  - Does NOT extend BaseEntity (BaseEntity includes updatedAt).
 *  - event_id has a UNIQUE constraint for idempotent event processing.
 *  - A DB trigger should block UPDATE and DELETE in production.
 */
@Entity('audit_logs')
@Index(['tenantId', 'instanceId'])
@Index(['tenantId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Index()
  @Column({ type: 'uuid', name: 'instance_id' })
  instanceId: string;

  @Column({ type: 'uuid', name: 'actor_id' })
  actorId: string;

  /** Snapshot of actor's email at the time of the action */
  @Column({ type: 'varchar', length: 255, name: 'actor_email' })
  actorEmail: string;

  /** Snapshot of actor's primary role at the time of the action */
  @Column({ type: 'varchar', length: 100, name: 'actor_role' })
  actorRole: string;

  @Column({
    type: 'enum',
    enum: AuditActionType,
    name: 'action_type',
  })
  actionType: AuditActionType;

  @Column({ type: 'uuid', name: 'transition_id', nullable: true, default: null })
  transitionId: string | null;

  /** Snapshot of transition name — null for instance_created / instance_cancelled */
  @Column({ type: 'varchar', length: 100, name: 'transition_name', nullable: true, default: null })
  transitionName: string | null;

  /** Snapshot of the state before the action — null for instance_created */
  @Column({ type: 'varchar', length: 100, name: 'from_state', nullable: true, default: null })
  fromState: string | null;

  /** Snapshot of the state after the action */
  @Column({ type: 'varchar', length: 100, name: 'to_state' })
  toState: string;

  @Column({ type: 'text', nullable: true, default: null })
  comment: string | null;

  @Column({ type: 'varchar', length: 45, name: 'ip_address', nullable: true, default: null })
  ipAddress: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true, default: null })
  userAgent: string | null;

  /** NATS event UUID — UNIQUE constraint enforces idempotent processing */
  @Column({ type: 'uuid', name: 'event_id', unique: true })
  eventId: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

