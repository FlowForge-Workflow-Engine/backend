import { CustomRuleEvaluator } from "./custom-rule.evaluator";
import { CustomRuleStrategy, RuleContext, RuleDefinition, RuleType } from "../interfaces/rule.interfaces";

describe("CustomRuleEvaluator", () => {
  const context: RuleContext = {
    payload: {
      startDate: "2024-01-01",
      endDate: "2024-01-03",
      days: 3,
    },
    user: { id: "u1", role: "Admin", roles: ["Admin", "Approver"] },
    instance: { currentState: "Draft", createdAt: "2024-01-01T00:00:00Z" },
  };

  it("isCustomRule detects custom definitions", () => {
    const evaluator = new CustomRuleEvaluator();
    const rule: RuleDefinition = {
      ruleName: "r1",
      ruleDefinition: { type: RuleType.CUSTOM, strategy: CustomRuleStrategy.USER_HAS_ANY_ROLE, params: {} },
    };
    expect(evaluator.isCustomRule(rule)).toBe(true);
  });

  it("returns failure for unknown strategy", async () => {
    const evaluator = new CustomRuleEvaluator();
    const rule: RuleDefinition = {
      ruleName: "unknown",
      ruleDefinition: { type: RuleType.CUSTOM, strategy: "nope", params: {} },
    };
    const result = await evaluator.evaluate(rule, context);
    expect(result.passed).toBe(false);
    expect(result.failedRules[0]?.reason).toMatch(/No custom rule evaluator registered/i);
  });

  it("USER_HAS_ANY_ROLE passes when user has one of the roles", async () => {
    const evaluator = new CustomRuleEvaluator();
    const rule: RuleDefinition = {
      ruleName: "has-role",
      ruleDefinition: {
        type: RuleType.CUSTOM,
        strategy: CustomRuleStrategy.USER_HAS_ANY_ROLE,
        params: { roles: ["Approver"] },
      },
    };
    const result = await evaluator.evaluate(rule, context);
    expect(result).toEqual({ passed: true, failedRules: [] });
  });

  it("USER_HAS_ANY_ROLE fails when roles param is empty", async () => {
    const evaluator = new CustomRuleEvaluator();
    const rule: RuleDefinition = {
      ruleName: "has-role",
      ruleDefinition: {
        type: RuleType.CUSTOM,
        strategy: CustomRuleStrategy.USER_HAS_ANY_ROLE,
        params: { roles: [] },
      },
    };
    const result = await evaluator.evaluate(rule, context);
    expect(result.passed).toBe(false);
    expect(result.failedRules[0]?.reason).toMatch(/requires a non-empty "roles" array/i);
  });

  it("DATE_RANGE_MATCHES_DAYS passes when inclusive days match payload days", async () => {
    const evaluator = new CustomRuleEvaluator();
    const rule: RuleDefinition = {
      ruleName: "date-range",
      ruleDefinition: { type: RuleType.CUSTOM, strategy: CustomRuleStrategy.DATE_RANGE_MATCHES_DAYS, params: {} },
    };
    const result = await evaluator.evaluate(rule, context);
    expect(result).toEqual({ passed: true, failedRules: [] });
  });

  it("DATE_RANGE_MATCHES_DAYS fails when range is invalid", async () => {
    const evaluator = new CustomRuleEvaluator();
    const rule: RuleDefinition = {
      ruleName: "date-range",
      ruleDefinition: { type: RuleType.CUSTOM, strategy: CustomRuleStrategy.DATE_RANGE_MATCHES_DAYS, params: {} },
    };
    const badContext: RuleContext = {
      ...context,
      payload: {
        startDate: "2024-01-10",
        endDate: "2024-01-01",
        days: 1,
      },
    };
    const result = await evaluator.evaluate(rule, badContext);
    expect(result.passed).toBe(false);
    expect(result.failedRules[0]?.reason).toMatch(/date range.*invalid/i);
  });
});

