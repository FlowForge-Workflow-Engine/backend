import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@app/shared/entities/base.entity';

/**
 * JSON Schema for the dynamic form associated with a workflow definition.
 * One-to-one relationship with WorkflowDefinition.
 *
 * schema shape: { fields: [{ key, type, label, required }] }
 * Consumed by the front-end form renderer to build instance creation forms.
 */
@Entity('instance_form_schemas')
@Index(['workflowDefinitionId'], { unique: true })
export class InstanceFormSchema extends BaseEntity {
  @Column({ type: 'uuid', name: 'workflow_definition_id' })
  workflowDefinitionId: string;

  @Column({ type: 'jsonb' })
  schema: Record<string, unknown>;
}

