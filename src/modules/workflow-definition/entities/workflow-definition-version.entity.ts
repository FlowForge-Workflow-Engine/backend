import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@app/shared/entities/base.entity';

/**
 * Immutable snapshot of a workflow definition at publish time.
 *
 * Constraint 10: Running instances store `definitionVersion` and use the
 * snapshot for execution — live definition rows are never consulted at
 * runtime after publication.
 *
 * UNIQUE(workflowDefinitionId, versionNumber) enforced at DB + index level.
 */
@Entity('workflow_definition_versions')
@Index(['workflowDefinitionId', 'versionNumber'], { unique: true })
export class WorkflowDefinitionVersion extends BaseEntity {
  @Column({ type: 'uuid', name: 'workflow_definition_id' })
  workflowDefinitionId: string;

  @Column({ type: 'integer', name: 'version_number' })
  versionNumber: number;

  /**
   * Full frozen snapshot: { name, states[], transitions[], rules[] }
   * Used by WorkflowExecutionModule at transition time.
   */
  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  /** Only one version per definition should have isActive = true at a time. */
  @Column({ type: 'boolean', name: 'is_active', default: false })
  isActive: boolean;

  @Column({ type: 'uuid', name: 'published_by' })
  publishedBy: string;

  @Column({ type: 'timestamptz', name: 'published_at', nullable: true })
  publishedAt: Date | null;
}

