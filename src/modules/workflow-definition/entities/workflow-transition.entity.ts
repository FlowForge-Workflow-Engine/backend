import { Column, Entity } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";

/**
 * A directed edge in the workflow state machine.
 * Extends BaseEntity → tenantId (indexed), id, createdAt, updatedAt.
 *
 * allowedRoleIds: PostgreSQL UUID[] array.
 * At transition time, the executor verifies the acting user's roles
 * intersect with this list before evaluating rules.
 */
@Entity("workflow_transitions")
export class WorkflowTransition extends BaseEntity {
  /** Foreign key to workflow definition - links transition to specific workflow */
  @Column({ type: "uuid", name: "workflow_definition_id" })
  workflowDefinitionId: string;

  /** Human-readable name for the transition - describes the action being performed */
  @Column({ type: "varchar", length: 100 })
  name: string;

  /** Source state ID - defines where transition can be triggered from */
  @Column({ type: "uuid", name: "from_state_id" })
  fromStateId: string;

  /** Target state ID - defines where transition leads to */
  @Column({ type: "uuid", name: "to_state_id" })
  toStateId: string;

  /**
   * PostgreSQL UUID[] column - defines which roles can execute this transition
   * Empty array = any role can trigger the transition.
   */
  @Column({ type: "uuid", array: true, name: "allowed_role_ids", default: "{}" })
  allowedRoleIds: string[];

  /** Flag indicating if comment is mandatory for this transition - enforces documentation */
  @Column({ type: "boolean", name: "requires_comment", default: false })
  requiresComment: boolean;
}
