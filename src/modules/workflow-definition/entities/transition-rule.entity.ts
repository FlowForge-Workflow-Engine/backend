import { Column, Entity } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";

/**
 * A json-rules-engine rule attached to a workflow transition.
 * Extends BaseEntity → tenantId (indexed), id, createdAt, updatedAt.
 *
 * Constraint 8: Rules are stored as JSON AST in the `rule_definition` JSONB column.
 * Evaluation is performed by RuleEngineService — never inline in this module.
 *
 * evaluationOrder: Lower number = evaluated first when multiple rules exist.
 */
@Entity("transition_rules")
export class TransitionRule extends BaseEntity {
  /** Foreign key to workflow transition - links rule to specific transition */
  @Column({ type: "uuid", name: "transition_id" })
  transitionId: string;

  /** Human-readable name for the rule - describes rule purpose */
  @Column({ type: "varchar", length: 100, name: "rule_name" })
  ruleName: string;

  /**
   * json-rules-engine conditions AST - defines business logic for transition execution
   * Shape: { all: [...] } | { any: [...] } | { not: {...} }
   */
  @Column({ type: "jsonb", name: "rule_definition" })
  ruleDefinition: Record<string, unknown>;

  /** Order of rule evaluation when multiple rules exist - controls rule precedence */
  @Column({ type: "integer", name: "evaluation_order", default: 0 })
  evaluationOrder: number;
}
