import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";

export enum WorkflowInstanceStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

/**
 * A running instance of a published workflow definition.
 *
 * Constraint 6 — Optimistic Locking:
 *   `version` is incremented atomically inside the transition transaction.
 *   A mismatch means concurrent transition → 409 ConflictException.
 *
 * Constraint 10 — Versioned Definitions:
 *   `definitionVersion` links to the snapshot used at creation time.
 *   The live definition can change without affecting this instance.
 */
@Entity("workflow_instances")
@Index(["tenantId", "status"])
@Index(["tenantId", "workflowDefinitionId"])
export class WorkflowInstance extends BaseEntity {
  /** Foreign key to workflow definition - links instance to its template */
  @Column({ type: "uuid", name: "workflow_definition_id" })
  workflowDefinitionId: string;

  /** Version of definition used at creation - ensures instance uses consistent snapshot */
  @Column({ type: "integer", name: "definition_version" })
  definitionVersion: number;

  /** Current state ID in the workflow - tracks instance position in state machine */
  @Column({ type: "uuid", name: "current_state_id" })
  currentStateId: string;

  /** Denormalized state name — avoids snapshot lookup on every read - performance optimization */
  @Column({ type: "varchar", length: 100, name: "current_state_name" })
  currentStateName: string;

  /** Dynamic data associated with this instance - stores business context and form data */
  @Column({ type: "jsonb", default: "{}" })
  payload: Record<string, unknown>;

  /** Current lifecycle status of the instance - tracks overall instance state */
  @Column({
    type: "enum",
    enum: WorkflowInstanceStatus,
    default: WorkflowInstanceStatus.ACTIVE,
  })
  status: WorkflowInstanceStatus;

  /**
   * Optimistic lock counter (Constraint 6) - prevents concurrent modification conflicts
   * Each successful transition increments this by 1.
   */
  @Column({ type: "integer", default: 1 })
  version: number;

  /** UUID of the user who created this instance (from JWT — no FK) - tracks instance creator */
  @Column({ type: "uuid", name: "created_by" })
  createdBy: string;

  /** Timestamp when instance reached terminal state - null for active instances */
  @Column({ type: "timestamptz", name: "completed_at", nullable: true, default: null })
  completedAt: Date | null;
}
