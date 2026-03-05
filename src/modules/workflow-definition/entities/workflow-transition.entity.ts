import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@app/shared/entities/base.entity';

/**
 * A directed edge in the workflow state machine.
 * Extends BaseEntity → tenantId (indexed), id, createdAt, updatedAt.
 *
 * allowedRoleIds: PostgreSQL UUID[] array.
 * At transition time, the executor verifies the acting user's roles
 * intersect with this list before evaluating rules.
 */
@Entity('workflow_transitions')
export class WorkflowTransition extends BaseEntity {
  @Column({ type: 'uuid', name: 'workflow_definition_id' })
  workflowDefinitionId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'uuid', name: 'from_state_id' })
  fromStateId: string;

  @Column({ type: 'uuid', name: 'to_state_id' })
  toStateId: string;

  /**
   * PostgreSQL UUID[] column.
   * Empty array = any role can trigger the transition.
   */
  @Column({ type: 'uuid', array: true, name: 'allowed_role_ids', default: '{}' })
  allowedRoleIds: string[];

  @Column({ type: 'boolean', name: 'requires_comment', default: false })
  requiresComment: boolean;
}

