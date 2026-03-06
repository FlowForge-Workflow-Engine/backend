import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { AuditActionType } from "../enum/audit-action-type.enum";

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
  @Column({ type: "uuid", name: "instance_id", nullable: true, default: null })
  instanceId: string | null;

  /** User ID who performed the action - stored as snapshot for historical accuracy */
  @Column({ type: "uuid", name: "actor_id", nullable: true, default: null })
  actorId: string | null;

  /** Snapshot of actor's email at the time of the action - preserves historical context even if user email changes */
  @Column({ type: "varchar", length: 255, name: "actor_email", nullable: true, default: null })
  actorEmail: string | null;

  /** Snapshot of actor's primary role at the time of the action - preserves role context for compliance */
  @Column({ type: "varchar", length: 100, name: "actor_role", nullable: true, default: null })
  actorRole: string | null;

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
  @Column({ type: "varchar", length: 100, name: "to_state", nullable: true, default: null })
  toState: string | null;

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

  /** Logical resource type affected by the event (user, tenant, workflow_definition, workflow_instance). */
  @Column({ type: "varchar", length: 100, name: "resource_type" })
  resourceType: string;

  /** Resource identifier affected by the event. */
  @Column({ type: "uuid", name: "resource_id" })
  resourceId: string;

  /** Timestamp from the emitted event payload, distinct from DB insertion time. */
  @Column({ type: "timestamptz", name: "occurred_at" })
  occurredAt: Date;

  /** Raw event payload snapshot for immutable audit reconstruction. */
  @Column({ type: "jsonb", nullable: true, default: null })
  payload: Record<string, unknown> | null;

  /** Timestamp when audit record was created - immutable for compliance and chronological ordering */
  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
}
