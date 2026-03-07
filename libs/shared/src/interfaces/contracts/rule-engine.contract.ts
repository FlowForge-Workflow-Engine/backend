export const RULE_ENGINE_CONTRACT = Symbol("RULE_ENGINE_CONTRACT");

export enum RuleFactNamespace {
  PAYLOAD = "payload",
  USER = "user",
  INSTANCE = "instance",
}

export const RULE_FACT_NAMESPACES = [
  RuleFactNamespace.PAYLOAD,
  RuleFactNamespace.USER,
  RuleFactNamespace.INSTANCE,
] as const;

export enum RuleType {
  EXPRESSION = "expression",
  CUSTOM = "custom",
}

export const RULE_TYPES = [RuleType.EXPRESSION, RuleType.CUSTOM] as const;

export enum CustomRuleStrategy {
  DATE_RANGE_MATCHES_DAYS = "date-range-matches-days",
  USER_HAS_ANY_ROLE = "user-has-any-role",
}

export const CUSTOM_RULE_STRATEGIES = [
  CustomRuleStrategy.DATE_RANGE_MATCHES_DAYS,
  CustomRuleStrategy.USER_HAS_ANY_ROLE,
] as const;

export const RULE_EXPRESSION_OPERATORS = [
  "equal",
  "notEqual",
  "lessThan",
  "lessThanInclusive",
  "greaterThan",
  "greaterThanInclusive",
  "in",
  "notIn",
  "contains",
  "doesNotContain",
] as const;

export type RuleExpressionOperator = (typeof RULE_EXPRESSION_OPERATORS)[number];

export const RULE_EXPRESSION_OPERATOR_DECORATORS = [
  "everyFact",
  "everyValue",
  "someFact",
  "someValue",
  "not",
  "swap",
] as const;

export type RuleExpressionOperatorDecorator = (typeof RULE_EXPRESSION_OPERATOR_DECORATORS)[number];

export interface RuleSystemPathMetadata {
  readonly fact: RuleFactNamespace.USER | RuleFactNamespace.INSTANCE;
  readonly path: string;
  readonly fullPath: string;
  readonly description: string;
}

export const RULE_SYSTEM_PATHS: readonly RuleSystemPathMetadata[] = [
  {
    fact: RuleFactNamespace.USER,
    path: "$.id",
    fullPath: "user.id",
    description: "Authenticated actor ID from the JWT context",
  },
  {
    fact: RuleFactNamespace.USER,
    path: "$.role",
    fullPath: "user.role",
    description: "Primary actor role resolved from the first JWT role",
  },
  {
    fact: RuleFactNamespace.USER,
    path: "$.roles",
    fullPath: "user.roles",
    description: "Authenticated actor roles from the JWT context",
  },
  {
    fact: RuleFactNamespace.INSTANCE,
    path: "$.currentState",
    fullPath: "instance.currentState",
    description: "Current workflow state name of the instance",
  },
  {
    fact: RuleFactNamespace.INSTANCE,
    path: "$.createdAt",
    fullPath: "instance.createdAt",
    description: "Workflow instance creation timestamp in ISO-8601 format",
  },
];

export const RULE_PAYLOAD_PATH_FORMAT = "$.<schemaFieldKey>";
export const RULE_PAYLOAD_PATH_SOURCE = "/workflow-definitions/:id/instance-form-schema";

export const RULE_EXPRESSION_DEFINITION_FIELDS = ["type", "all", "any", "not"] as const;
export type RuleExpressionDefinitionField = (typeof RULE_EXPRESSION_DEFINITION_FIELDS)[number];

export const RULE_CUSTOM_DEFINITION_FIELDS = ["type", "strategy", "params"] as const;
export type RuleCustomDefinitionField = (typeof RULE_CUSTOM_DEFINITION_FIELDS)[number];

export const RULE_EXPRESSION_DEFINITION: ExpressionRuleDefinition = {
  type: RuleType.EXPRESSION,
  all: [
    {
      fact: RuleFactNamespace.PAYLOAD,
      path: "$.amount",
      operator: "greaterThan",
      value: 1000,
    },
  ],
};

export const RULE_CUSTOM_DEFINITION: CustomRuleDefinition = {
  type: RuleType.CUSTOM,
  strategy: CustomRuleStrategy.USER_HAS_ANY_ROLE,
  params: {
    roles: ["manager", "admin"],
  },
};

export interface RuleMetadata {
  readonly facts: readonly RuleFactNamespace[];
  readonly ruleTypes: readonly RuleType[];
  readonly customStrategies: readonly CustomRuleStrategy[];
  readonly expressionOperators: readonly RuleExpressionOperator[];
  readonly operatorDecorators: readonly RuleExpressionOperatorDecorator[];
  readonly systemPaths: readonly RuleSystemPathMetadata[];
  readonly payloadPathFormat: string;
  readonly payloadPathSource: string;
  readonly expressionRuleDefinitionFields: readonly RuleExpressionDefinitionField[];
  readonly customRuleDefinitionFields: readonly RuleCustomDefinitionField[];
  readonly expressionRuleDefinition: ExpressionRuleDefinition;
  readonly customRuleDefinition: CustomRuleDefinition;
}

export const RULE_METADATA: RuleMetadata = {
  facts: RULE_FACT_NAMESPACES,
  ruleTypes: RULE_TYPES,
  customStrategies: CUSTOM_RULE_STRATEGIES,
  expressionOperators: RULE_EXPRESSION_OPERATORS,
  operatorDecorators: RULE_EXPRESSION_OPERATOR_DECORATORS,
  systemPaths: RULE_SYSTEM_PATHS,
  payloadPathFormat: RULE_PAYLOAD_PATH_FORMAT,
  payloadPathSource: RULE_PAYLOAD_PATH_SOURCE,
  expressionRuleDefinitionFields: RULE_EXPRESSION_DEFINITION_FIELDS,
  customRuleDefinitionFields: RULE_CUSTOM_DEFINITION_FIELDS,
  expressionRuleDefinition: RULE_EXPRESSION_DEFINITION,
  customRuleDefinition: RULE_CUSTOM_DEFINITION,
};

export interface ExpressionRuleDefinition {
  readonly type?: RuleType.EXPRESSION;
  readonly all?: ReadonlyArray<Record<string, unknown>>;
  readonly any?: ReadonlyArray<Record<string, unknown>>;
  readonly not?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

export interface CustomRuleDefinition {
  readonly type: RuleType.CUSTOM;
  readonly strategy: CustomRuleStrategy | string;
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
