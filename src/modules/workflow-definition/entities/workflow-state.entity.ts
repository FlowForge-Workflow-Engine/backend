import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@app/shared/entities/base.entity';

/**
 * A single state node in a workflow definition graph.
 * Extends BaseEntity → tenantId (indexed), id, createdAt, updatedAt.
 *
 * Business rules enforced in service layer:
 * - Exactly ONE state per definition may have isInitial = true.
 * - Terminal states have no outgoing transitions.
 */
@Entity('workflow_states')
export class WorkflowState extends BaseEntity {
  @Column({ type: 'uuid', name: 'workflow_definition_id' })
  workflowDefinitionId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({ type: 'boolean', name: 'is_initial', default: false })
  isInitial: boolean;

  @Column({ type: 'boolean', name: 'is_terminal', default: false })
  isTerminal: boolean;

  /** Canvas X position for the visual designer. */
  @Column({ type: 'float', name: 'position_x', nullable: true, default: null })
  positionX: number | null;

  /** Canvas Y position for the visual designer. */
  @Column({ type: 'float', name: 'position_y', nullable: true, default: null })
  positionY: number | null;

  /** Arbitrary display metadata: color, icon, etc. */
  @Column({ type: 'jsonb', nullable: true, default: null })
  metadata: Record<string, unknown> | null;
}

