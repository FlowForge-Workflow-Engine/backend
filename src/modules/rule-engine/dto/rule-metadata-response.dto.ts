import { ApiProperty } from "@nestjs/swagger";
import {
  CustomRuleDefinition,
  RULE_CUSTOM_DEFINITION_FIELDS,
  CustomRuleStrategy,
  ExpressionRuleDefinition,
  RULE_EXPRESSION_DEFINITION_FIELDS,
  RULE_EXPRESSION_OPERATORS,
  RULE_EXPRESSION_OPERATOR_DECORATORS,
  RULE_FACT_NAMESPACES,
  RuleFactNamespace,
  RuleMetadata,
  RULE_PAYLOAD_PATH_FORMAT,
  RULE_PAYLOAD_PATH_SOURCE,
  RuleSystemPathMetadata,
  RuleType,
  RULE_TYPES,
  CUSTOM_RULE_STRATEGIES,
  RuleExpressionOperator,
  RuleExpressionOperatorDecorator,
} from "@app/shared/interfaces/contracts/rule-engine.contract";

export class RuleSystemPathResponseDto {
  @ApiProperty({ enum: RuleFactNamespace, example: RuleFactNamespace.USER })
  fact: RuleFactNamespace;

  @ApiProperty({ example: "$.roles", description: "Path to use together with the fact namespace" })
  path: string;

  @ApiProperty({ example: "user.roles", description: "Convenience combined reference for UI display" })
  fullPath: string;

  @ApiProperty({ example: "Authenticated actor roles from the JWT context" })
  description: string;

  static fromMetadata(path: RuleSystemPathMetadata): RuleSystemPathResponseDto {
    const dto = new RuleSystemPathResponseDto();
    dto.fact = path.fact;
    dto.path = path.path;
    dto.fullPath = path.fullPath;
    dto.description = path.description;
    return dto;
  }
}

export class RuleMetadataResponseDto {
  @ApiProperty({
    enum: RuleFactNamespace,
    isArray: true,
    example: [...RULE_FACT_NAMESPACES],
    description: "Fixed top-level fact namespaces supported by the rule engine",
  })
  facts: RuleFactNamespace[];

  @ApiProperty({
    enum: RuleType,
    isArray: true,
    example: [...RULE_TYPES],
    description: "Supported rule definition types",
  })
  ruleTypes: RuleType[];

  @ApiProperty({
    enum: CustomRuleStrategy,
    isArray: true,
    example: [...CUSTOM_RULE_STRATEGIES],
    description: "Currently supported custom rule strategies",
  })
  customStrategies: CustomRuleStrategy[];

  @ApiProperty({
    enum: RULE_EXPRESSION_OPERATORS,
    isArray: true,
    example: [...RULE_EXPRESSION_OPERATORS],
    description: "Documented built-in json-rules-engine operators used by this project today",
  })
  expressionOperators: RuleExpressionOperator[];

  @ApiProperty({
    enum: RULE_EXPRESSION_OPERATOR_DECORATORS,
    isArray: true,
    example: [...RULE_EXPRESSION_OPERATOR_DECORATORS],
    description: "Documented json-rules-engine operator decorators used by this project today",
  })
  operatorDecorators: RuleExpressionOperatorDecorator[];

  @ApiProperty({
    type: [RuleSystemPathResponseDto],
    description: "Fixed non-payload paths exposed by the runtime rule context",
  })
  systemPaths: RuleSystemPathResponseDto[];

  @ApiProperty({
    example: RULE_PAYLOAD_PATH_FORMAT,
    description: "Path format to use when fact is payload; replace <schemaFieldKey> with a schema key",
  })
  payloadPathFormat: string;

  @ApiProperty({
    example: RULE_PAYLOAD_PATH_SOURCE,
    description: "Workflow-specific endpoint that exposes available payload schema keys",
  })
  payloadPathSource: string;

  @ApiProperty({
    isArray: true,
    example: [...RULE_EXPRESSION_DEFINITION_FIELDS],
    description: "Top-level fields the frontend can use while building an expression ruleDefinition",
  })
  expressionRuleDefinitionFields: string[];

  @ApiProperty({
    isArray: true,
    example: [...RULE_CUSTOM_DEFINITION_FIELDS],
    description: "Top-level fields the frontend can use while building a custom ruleDefinition",
  })
  customRuleDefinitionFields: string[];

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    example: {
      type: RuleType.EXPRESSION,
      all: [
        {
          fact: RuleFactNamespace.PAYLOAD,
          path: "$.amount",
          operator: "greaterThan",
          value: 1000,
        },
      ],
    },
    description:
      "Example shape of an expression ruleDefinition payload that the frontend can build and submit",
  })
  expressionRuleDefinitionExample: ExpressionRuleDefinition;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    example: {
      type: RuleType.CUSTOM,
      strategy: CustomRuleStrategy.USER_HAS_ANY_ROLE,
      params: {
        roles: ["manager", "admin"],
      },
    },
    description: "Example shape of a custom ruleDefinition payload that the frontend can build and submit",
  })
  customRuleDefinitionExample: CustomRuleDefinition;

  static fromMetadata(metadata: RuleMetadata): RuleMetadataResponseDto {
    const dto = new RuleMetadataResponseDto();
    dto.facts = [...metadata.facts];
    dto.ruleTypes = [...metadata.ruleTypes];
    dto.customStrategies = [...metadata.customStrategies];
    dto.expressionOperators = [...metadata.expressionOperators];
    dto.operatorDecorators = [...metadata.operatorDecorators];
    dto.systemPaths = metadata.systemPaths.map((path) => RuleSystemPathResponseDto.fromMetadata(path));
    dto.payloadPathFormat = metadata.payloadPathFormat;
    dto.payloadPathSource = metadata.payloadPathSource;
    dto.expressionRuleDefinitionFields = [...metadata.expressionRuleDefinitionFields];
    dto.customRuleDefinitionFields = [...metadata.customRuleDefinitionFields];
    dto.expressionRuleDefinitionExample = metadata.expressionRuleDefinition;
    dto.customRuleDefinitionExample = metadata.customRuleDefinition;
    return dto;
  }
}
