/**
 * A single rule definition stored as json-rules-engine AST in JSONB.
 * Persisted in `transition_rules.rule_definition` column.
 */
export interface RuleDefinition {
  /** Human-readable rule name — used in failure reporting */
  readonly ruleName: string;
  /**
   * json-rules-engine conditions object.
   * Shape: { all: [...] } | { any: [...] } | { not: {...} }
   * Each leaf: { fact: string; operator: string; value: unknown; path?: string }
   */
  readonly conditions: Record<string, unknown>;
  /** Lower number = evaluated first */
  readonly evaluationOrder?: number;
}

/**
 * Context facts fed into the rule engine during transition evaluation.
 * Mirrors the shape expected by rule authors when designing conditions.
 */
export interface RuleContext {
  /** The workflow instance's dynamic payload (form data, etc.) */
  readonly payload: Record<string, unknown>;
  /** Authenticated user performing the transition */
  readonly user: {
    readonly id: string;
    /** Primary role name (convenience — same as roles[0] for simple RBAC) */
    readonly role: string;
    readonly roles: string[];
  };
  /** Snapshot of the instance being transitioned */
  readonly instance: {
    readonly currentState: string;
    readonly createdAt: string; // ISO string
  };
}

/**
 * Result returned by RuleEngineService.evaluateRules().
 */
export interface RuleEvaluationResult {
  /** true if ALL rules passed */
  readonly passed: boolean;
  /** Non-empty only when passed === false */
  readonly failedRules: ReadonlyArray<{
    readonly ruleName: string;
    readonly reason: string;
  }>;
}

