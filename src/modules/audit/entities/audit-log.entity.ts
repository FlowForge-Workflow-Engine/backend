import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export enum AuditActionType {
  INSTANCE_CREATED = "instance_created",
  TRANSITION_EXECUTED = "transition_executed",
  INSTANCE_CANCELLED = "instance_cancelled",
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
@Entity("audit_logs")
@Index(["tenantId", "instanceId"])
@Index(["tenantId", "createdAt"])
export class AuditLog {
  /** Primary key - unique identifier for each audit log entry */
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** Multi-tenant isolation - links audit record to specific tenant for data segregation */
  @Index()
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId: string;

  /** Links audit record to specific workflow instance being tracked */
  @Index()
  @Column({ type: "uuid", name: "instance_id" })
  instanceId: string;

  /** User ID who performed the action - stored as snapshot for historical accuracy */
  @Column({ type: "uuid", name: "actor_id" })
  actorId: string;

  /** Snapshot of actor's email at the time of the action - preserves historical context even if user email changes */
  @Column({ type: "varchar", length: 255, name: "actor_email" })
  actorEmail: string;

  /** Snapshot of actor's primary role at the time of the action - preserves role context for compliance */
  @Column({ type: "varchar", length: 100, name: "actor_role" })
  actorRole: string;

  /** Type of action performed - categorizes audit events for filtering and reporting */
  @Column({
    type: "enum",
    enum: AuditActionType,
    name: "action_type",
  })
  actionType: AuditActionType;

  /** ID of transition executed - null for non-transition actions like instance creation/cancellation */
  @Column({ type: "uuid", name: "transition_id", nullable: true, default: null })
  transitionId: string | null;

  /** Snapshot of transition name — null for instance_created / instance_cancelled - provides human-readable context */
  @Column({ type: "varchar", length: 100, name: "transition_name", nullable: true, default: null })
  transitionName: string | null;

  /** Snapshot of the state before the action — null for instance_created - tracks state changes for audit trail */
  @Column({ type: "varchar", length: 100, name: "from_state", nullable: true, default: null })
  fromState: string | null;

  /** Snapshot of the state after the action - records final state for compliance tracking */
  @Column({ type: "varchar", length: 100, name: "to_state" })
  toState: string;

  /** Optional user comment explaining the action - provides business context for decisions */
  @Column({ type: "text", nullable: true, default: null })
  comment: string | null;

  /** IP address of the user performing action - security audit trail for forensic analysis */
  @Column({ type: "varchar", length: 45, name: "ip_address", nullable: true, default: null })
  ipAddress: string | null;

  /** Browser/client user agent - technical context for security and debugging */
  @Column({ type: "text", name: "user_agent", nullable: true, default: null })
  userAgent: string | null;

  /** NATS event UUID — UNIQUE constraint enforces idempotent processing - prevents duplicate audit entries */
  @Column({ type: "uuid", name: "event_id", unique: true })
  eventId: string;

  /** Timestamp when audit record was created - immutable for compliance and chronological ordering */
  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
}
