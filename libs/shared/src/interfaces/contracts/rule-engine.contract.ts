export const RULE_ENGINE_CONTRACT = Symbol("RULE_ENGINE_CONTRACT");

export interface ExpressionRuleDefinition {
  readonly type?: "expression";
  readonly all?: ReadonlyArray<Record<string, unknown>>;
  readonly any?: ReadonlyArray<Record<string, unknown>>;
  readonly not?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

export interface CustomRuleDefinition {
  readonly type: "custom";
  readonly strategy: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export type WorkflowRuleDefinition = ExpressionRuleDefinition | CustomRuleDefinition;

export interface RuleDefinition {
  readonly id?: string;
  readonly ruleName: string;
  readonly ruleDefinition: WorkflowRuleDefinition;
  readonly evaluationOrder?: number;
}

export interface RuleContext {
  readonly payload: Record<string, unknown>;
  readonly user: {
    readonly id: string;
    readonly role: string;
    readonly roles: string[];
  };
  readonly instance: {
    readonly currentState: string;
    readonly createdAt: string;
  };
}

export interface RuleEvaluationResult {
  readonly passed: boolean;
  readonly failedRules: ReadonlyArray<{
    readonly ruleName: string;
    readonly reason: string;
  }>;
}

export interface IRuleEngineContract {
  evaluateRules(rules: RuleDefinition[], context: RuleContext): Promise<RuleEvaluationResult>;
}
