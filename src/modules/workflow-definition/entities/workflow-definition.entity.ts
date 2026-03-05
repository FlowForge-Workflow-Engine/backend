import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@app/shared/entities/base.entity';

export enum WorkflowDefinitionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
}

/**
 * Root aggregate for a workflow definition.
 * Extends BaseEntity → inherits id, tenantId (indexed), createdAt, updatedAt.
 * Status lifecycle: draft → published → deprecated.
 */
@Entity('workflow_definitions')
export class WorkflowDefinition extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({ type: 'integer', name: 'current_version', default: 1 })
  currentVersion: number;

  @Column({
    type: 'enum',
    enum: WorkflowDefinitionStatus,
    default: WorkflowDefinitionStatus.DRAFT,
  })
  status: WorkflowDefinitionStatus;

  /**
   * ID of the user who created this definition.
   * Stored as UUID string — snapshot to avoid cross-module FK.
   */
  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;
}

