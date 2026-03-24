import { ConditionEvaluator } from "./condition.evaluator";
import { RuleDefinition, RuleType } from "../interfaces/rule.interfaces";

describe("ConditionEvaluator", () => {
  it("returns passed=true for empty rules", async () => {
    const evaluator = new ConditionEvaluator();
    const result = await evaluator.evaluate([], {});
    expect(result).toEqual({ passed: true, failedRules: [] });
  });

  it("passes when expression conditions are satisfied", async () => {
    const evaluator = new ConditionEvaluator();
    const rules: RuleDefinition[] = [
      {
        ruleName: "amount-gt-1000",
        evaluationOrder: 0,
        ruleDefinition: {
          type: RuleType.EXPRESSION,
          all: [{ fact: "payload", path: "$.amount", operator: "greaterThan", value: 1000 }],
        },
      },
    ];

    const result = await evaluator.evaluate(rules, { payload: { amount: 1500 } });
    expect(result.passed).toBe(true);
    expect(result.failedRules).toEqual([]);
  });

  it("fails when expression conditions are not satisfied", async () => {
    const evaluator = new ConditionEvaluator();
    const rules: RuleDefinition[] = [
      {
        ruleName: "amount-gt-1000",
        evaluationOrder: 0,
        ruleDefinition: {
          type: RuleType.EXPRESSION,
          all: [{ fact: "payload", path: "$.amount", operator: "greaterThan", value: 1000 }],
        },
      },
    ];

    const result = await evaluator.evaluate(rules, { payload: { amount: 10 } });
    expect(result.passed).toBe(false);
    expect(result.failedRules[0]?.ruleName).toBe("amount-gt-1000");
  });

  it("throws when provided a custom rule definition", async () => {
    const evaluator = new ConditionEvaluator();
    const rules: RuleDefinition[] = [
      {
        ruleName: "custom",
        evaluationOrder: 0,
        ruleDefinition: { type: RuleType.CUSTOM, strategy: "user-has-any-role", params: { roles: ["Admin"] } },
      },
    ];

    await expect(evaluator.evaluate(rules, { payload: {} })).rejects.toThrow(
      /cannot be evaluated as an expression rule/i
    );
  });
});

