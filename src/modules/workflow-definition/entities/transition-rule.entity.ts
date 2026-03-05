import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@app/shared/entities/base.entity';

/**
 * A json-rules-engine rule attached to a workflow transition.
 * Extends BaseEntity → tenantId (indexed), id, createdAt, updatedAt.
 *
 * Constraint 8: Rules are stored as JSON AST in the `rule_definition` JSONB column.
 * Evaluation is performed by RuleEngineService — never inline in this module.
 *
 * evaluationOrder: Lower number = evaluated first when multiple rules exist.
 */
@Entity('transition_rules')
export class TransitionRule extends BaseEntity {
  @Column({ type: 'uuid', name: 'transition_id' })
  transitionId: string;

  @Column({ type: 'varchar', length: 100, name: 'rule_name' })
  ruleName: string;

  /**
   * json-rules-engine conditions AST.
   * Shape: { all: [...] } | { any: [...] } | { not: {...} }
   */
  @Column({ type: 'jsonb', name: 'rule_definition' })
  ruleDefinition: Record<string, unknown>;

  @Column({ type: 'integer', name: 'evaluation_order', default: 0 })
  evaluationOrder: number;
}

