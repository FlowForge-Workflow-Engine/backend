import { RuleEngineService } from "./rule-engine.service";
import { RuleContextBuilder } from "../evaluators/rule-context.builder";
import { ConditionEvaluator } from "../evaluators/condition.evaluator";
import { CustomRuleEvaluator } from "../evaluators/custom-rule.evaluator";
import { RuleContext, RuleDefinition, RuleType } from "../interfaces/rule.interfaces";

describe("RuleEngineService", () => {
  const context: RuleContext = {
    payload: { amount: 1200 },
    user: { id: "u1", role: "Admin", roles: ["Admin"] },
    instance: { currentState: "Draft", createdAt: new Date("2024-01-01T00:00:00Z").toISOString() },
  };

  let contextBuilder: { build: jest.MockedFunction<RuleContextBuilder["build"]> };
  let conditionEvaluator: { evaluate: jest.MockedFunction<ConditionEvaluator["evaluate"]> };
  let customRuleEvaluator: {
    isCustomRule: jest.MockedFunction<CustomRuleEvaluator["isCustomRule"]>;
    evaluate: jest.MockedFunction<CustomRuleEvaluator["evaluate"]>;
  };

  let service: RuleEngineService;

  beforeEach(() => {
    contextBuilder = { build: jest.fn().mockReturnValue({ payload: {}, user: {}, instance: {} }) };
    conditionEvaluator = { evaluate: jest.fn() };
    customRuleEvaluator = { isCustomRule: jest.fn(), evaluate: jest.fn() };

    service = new RuleEngineService(
      contextBuilder as unknown as RuleContextBuilder,
      conditionEvaluator as unknown as ConditionEvaluator,
      customRuleEvaluator as unknown as CustomRuleEvaluator
    );
  });

  it("returns passed=true for empty rules", async () => {
    const result = await service.evaluateRules([], context);
    expect(result).toEqual({ passed: true, failedRules: [] });
    expect(contextBuilder.build).not.toHaveBeenCalled();
  });

  it("sorts by evaluationOrder and aggregates failed rules", async () => {
    const rules: RuleDefinition[] = [
      {
        ruleName: "second",
        evaluationOrder: 2,
        ruleDefinition: { type: RuleType.EXPRESSION, all: [] },
      },
      {
        ruleName: "first",
        evaluationOrder: 1,
        ruleDefinition: { type: RuleType.EXPRESSION, all: [] },
      },
    ];

    contextBuilder.build.mockReturnValue({ payload: context.payload, user: context.user, instance: context.instance });
    customRuleEvaluator.isCustomRule.mockReturnValue(false);

    conditionEvaluator.evaluate
      .mockResolvedValueOnce({
        passed: false,
        failedRules: [{ ruleName: "first", reason: "no" }],
      })
      .mockResolvedValueOnce({
        passed: true,
        failedRules: [],
      });

    const result = await service.evaluateRules(rules, context);

    expect(conditionEvaluator.evaluate).toHaveBeenCalledTimes(2);
    const firstCallRuleName = (conditionEvaluator.evaluate.mock.calls[0][0][0] as RuleDefinition).ruleName;
    expect(firstCallRuleName).toBe("first");
    expect(result.passed).toBe(false);
    expect(result.failedRules).toEqual([{ ruleName: "first", reason: "no" }]);
  });

  it("routes custom rules to CustomRuleEvaluator and expression rules to ConditionEvaluator", async () => {
    const rules: RuleDefinition[] = [
      {
        ruleName: "custom",
        evaluationOrder: 0,
        ruleDefinition: { type: RuleType.CUSTOM, strategy: "user-has-any-role", params: { roles: ["Admin"] } },
      },
      {
        ruleName: "expr",
        evaluationOrder: 1,
        ruleDefinition: { type: RuleType.EXPRESSION, all: [] },
      },
    ];

    contextBuilder.build.mockReturnValue({ payload: context.payload, user: context.user, instance: context.instance });
    customRuleEvaluator.isCustomRule
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    customRuleEvaluator.evaluate.mockResolvedValueOnce({ passed: true, failedRules: [] });
    conditionEvaluator.evaluate.mockResolvedValueOnce({ passed: true, failedRules: [] });

    const result = await service.evaluateRules(rules, context);

    expect(customRuleEvaluator.evaluate).toHaveBeenCalledTimes(1);
    expect(conditionEvaluator.evaluate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ passed: true, failedRules: [] });
  });
});

