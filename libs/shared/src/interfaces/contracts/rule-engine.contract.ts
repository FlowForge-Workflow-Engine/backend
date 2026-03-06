export const RULE_ENGINE_CONTRACT = Symbol("RULE_ENGINE_CONTRACT");

export interface RuleDefinition {
  readonly ruleName: string;
  readonly conditions: Record<string, unknown>;
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