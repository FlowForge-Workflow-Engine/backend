import { Injectable, Logger } from "@nestjs/common";
import { Engine, RuleProperties } from "json-rules-engine";
import {
  CustomRuleDefinition,
  RuleDefinition,
  RuleEvaluationResult,
  WorkflowRuleDefinition,
} from "../interfaces/rule.interfaces";

/**
 * Wraps the json-rules-engine `Engine` to evaluate a batch of rules
 * against a pre-built facts map.
 *
 * A FRESH Engine instance is created per evaluation call so that
 * there is no shared mutable state between concurrent requests.
 */
@Injectable()
export class ConditionEvaluator {
  private readonly logger = new Logger(ConditionEvaluator.name);

  async evaluate(rules: RuleDefinition[], facts: Record<string, unknown>): Promise<RuleEvaluationResult> {
    if (rules.length === 0) {
      return { passed: true, failedRules: [] };
    }

    const engine = new Engine([], { allowUndefinedFacts: false });

    const sorted = [...rules].sort((a, b) => (a.evaluationOrder ?? 0) - (b.evaluationOrder ?? 0));

    for (const rule of sorted) {
      const ruleProps: RuleProperties = {
        name: rule.ruleName,
        conditions: this.getConditions(rule) as RuleProperties["conditions"],
        event: { type: rule.ruleName },
        priority: sorted.length - (rule.evaluationOrder ?? 0),
      };
      engine.addRule(ruleProps);
    }

    try {
      const { failureResults } = await engine.run(facts);

      const failedRules = failureResults.map((result) => ({
        ruleName: result.name ?? "unknown",
        reason: `Rule "${result.name ?? "unknown"}" conditions were not satisfied`,
      }));

      return {
        passed: failedRules.length === 0,
        failedRules,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Rule evaluation error: ${message}`);
      throw err;
    }
  }

  private getConditions(rule: RuleDefinition): Record<string, unknown> {
    const definition = rule.ruleDefinition;

    if (this.isCustomRuleDefinition(definition)) {
      throw new Error(
        `Rule \"${rule.ruleName}\" uses custom strategy \"${definition.strategy}\" and cannot be evaluated as an expression rule`
      );
    }

    return definition;
  }

  private isCustomRuleDefinition(definition: WorkflowRuleDefinition): definition is CustomRuleDefinition {
    return definition["type"] === "custom";
  }
}
