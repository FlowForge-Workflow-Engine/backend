import { Injectable } from "@nestjs/common";
import {
  IRuleEngineContract,
  RuleContext,
  RuleDefinition,
  RuleEvaluationResult,
} from "@app/shared/interfaces/contracts/rule-engine.contract";
import { ConditionEvaluator } from "../evaluators/condition.evaluator";
import { CustomRuleEvaluator } from "../evaluators/custom-rule.evaluator";
import { RuleContextBuilder } from "../evaluators/rule-context.builder";

/**
 * Service for evaluating workflow transition rules.
 * Provides the public API for rule evaluation consumed by WorkflowExecutionModule.
 *
 * Rules are evaluated using json-rules-engine with a context built from:
 * - Workflow instance payload (current state data)
 * - User information (roles, permissions)
 * - Instance metadata (created date, actor, etc.)
 * - Optional custom strategies for logic that should not live in the AST
 */
@Injectable()
export class RuleEngineService implements IRuleEngineContract {
  constructor(
    private readonly contextBuilder: RuleContextBuilder,
    private readonly conditionEvaluator: ConditionEvaluator,
    private readonly customRuleEvaluator: CustomRuleEvaluator
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
    if (rules.length === 0) {
      return { passed: true, failedRules: [] };
    }

    const facts = this.contextBuilder.build(context);
    const sortedRules = [...rules].sort((a, b) => (a.evaluationOrder ?? 0) - (b.evaluationOrder ?? 0));
    const failedRules: Array<{ ruleName: string; reason: string }> = [];

    for (const rule of sortedRules) {
      const result = this.customRuleEvaluator.isCustomRule(rule)
        ? await this.customRuleEvaluator.evaluate(rule, context)
        : await this.conditionEvaluator.evaluate([rule], facts);

      if (!result.passed) {
        failedRules.push(...result.failedRules);
      }
    }

    // console.log({ failedRules });

    return {
      passed: failedRules.length === 0,
      failedRules,
    };
  }
}
