import { Injectable } from '@nestjs/common';
import { ConditionEvaluator } from '../evaluators/condition.evaluator';
import { RuleContextBuilder } from '../evaluators/rule-context.builder';
import {
  RuleContext,
  RuleDefinition,
  RuleEvaluationResult,
} from '../interfaces/rule.interfaces';

/**
 * Public API for rule evaluation consumed by WorkflowExecutionModule.
 *
 * This service is STATELESS — it performs no DB reads or writes.
 * It can be exported directly (no Symbol contract needed) because it
 * guards no database tables that require module-boundary protection.
 */
@Injectable()
export class RuleEngineService {
  constructor(
    private readonly contextBuilder: RuleContextBuilder,
    private readonly conditionEvaluator: ConditionEvaluator,
  ) {}

  /**
   * Evaluate a list of rules against the provided execution context.
   *
   * @param rules - Array of RuleDefinition objects (from transition_rules rows)
   * @param context - Runtime context: instance payload + user + instance meta
   * @returns RuleEvaluationResult — { passed, failedRules[] }
   */
  async evaluateRules(
    rules: RuleDefinition[],
    context: RuleContext,
  ): Promise<RuleEvaluationResult> {
    const facts = this.contextBuilder.build(context);
    return this.conditionEvaluator.evaluate(rules, facts);
  }
}

