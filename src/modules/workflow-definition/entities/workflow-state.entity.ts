import { Column, Entity } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";

/**
 * A single state node in a workflow definition graph.
 * Extends BaseEntity → tenantId (indexed), id, createdAt, updatedAt.
 *
 * Business rules enforced in service layer:
 * - Exactly ONE state per definition may have isInitial = true.
 * - Terminal states have no outgoing transitions.
 */
@Entity("workflow_states")
export class WorkflowState extends BaseEntity {
  /** Foreign key to workflow definition - links state to specific workflow */
  @Column({ type: "uuid", name: "workflow_definition_id" })
  workflowDefinitionId: string;

  /** Human-readable name for the state - describes the workflow stage */
  @Column({ type: "varchar", length: 100 })
  name: string;

  /** Optional description explaining state purpose - helps with workflow understanding */
  @Column({ type: "text", nullable: true, default: null })
  description: string | null;

  /** Flag indicating if this is the starting state - exactly one per workflow */
  @Column({ type: "boolean", name: "is_initial", default: false })
  isInitial: boolean;

  /** Flag indicating if this is an ending state - workflow completion point */
  @Column({ type: "boolean", name: "is_terminal", default: false })
  isTerminal: boolean;

  /** Canvas X position for the visual designer - UI layout positioning */
  @Column({ type: "float", name: "position_x", nullable: true, default: null })
  positionX: number | null;

  /** Canvas Y position for the visual designer - UI layout positioning */
  @Column({ type: "float", name: "position_y", nullable: true, default: null })
  positionY: number | null;

  /** Arbitrary display metadata: color, icon, etc. - customizes state appearance */
  @Column({ type: "jsonb", nullable: true, default: null })
  metadata: Record<string, unknown> | null;
}
