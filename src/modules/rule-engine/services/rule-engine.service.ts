import { Injectable } from "@nestjs/common";
import { ConditionEvaluator } from "../evaluators/condition.evaluator";
import { RuleContextBuilder } from "../evaluators/rule-context.builder";
import { RuleContext, RuleDefinition, RuleEvaluationResult } from "../interfaces/rule.interfaces";

/**
 * Service for evaluating workflow transition rules.
 * Provides the public API for rule evaluation consumed by WorkflowExecutionModule.
 *
 * This service is STATELESS — it performs no DB reads or writes.
 * It can be exported directly (no Symbol contract needed) because it
 * guards no database tables that require module-boundary protection.
 *
 * Rules are evaluated using json-rules-engine with a context built from:
 * - Workflow instance payload (current state data)
 * - User information (roles, permissions)
 * - Instance metadata (created date, actor, etc.)
 */
@Injectable()
export class RuleEngineService {
  constructor(
    private readonly contextBuilder: RuleContextBuilder,
    private readonly conditionEvaluator: ConditionEvaluator
  ) {}

  /**
   * Evaluates a list of rules against the provided execution context.
   * Builds a fact object from the context and evaluates all rules using json-rules-engine.
   * Returns both pass/fail status and list of failed rule names for detailed feedback.
   *
   * @param rules - Array of RuleDefinition objects (from transition_rules rows)
   * @param context - Runtime context containing:
   *   - instancePayload: Current workflow instance data
   *   - user: User information (id, email, roles)
   *   - instanceMeta: Instance metadata (createdAt, createdBy, etc.)
   * @returns Promise<RuleEvaluationResult> - { passed: boolean, failedRules: string[] }
   *   - passed: true if all rules pass, false if any rule fails
   *   - failedRules: array of rule names that failed (empty if all pass)
   */
  async evaluateRules(rules: RuleDefinition[], context: RuleContext): Promise<RuleEvaluationResult> {
    const facts = this.contextBuilder.build(context);
    return this.conditionEvaluator.evaluate(rules, facts);
  }
}
