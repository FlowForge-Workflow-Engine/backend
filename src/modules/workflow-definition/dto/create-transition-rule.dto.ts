import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  RuleFactNamespace,
  RULE_PAYLOAD_PATH_SOURCE,
  RuleType,
} from "@app/shared/interfaces/contracts/rule-engine.contract";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class TransitionSchemaFieldDto {
  @ApiProperty({
    example: "days",
    description: "Payload key/path expected from the client",
    required: true,
  })
  @MaxLength(100, { message: "Schema field key must not exceed 100 characters" })
  @MinLength(1, { message: "Schema field key must be at least 1 character long" })
  @IsString({ message: "Schema field key must be a string" })
  @IsNotEmpty({ message: "Schema field key is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly key: string;

  @ApiProperty({
    example: "number",
    description: "UI field type used by the client form renderer",
    required: true,
  })
  @MaxLength(50, { message: "Schema field type must not exceed 50 characters" })
  @MinLength(1, { message: "Schema field type must be at least 1 character long" })
  @IsString({ message: "Schema field type must be a string" })
  @IsNotEmpty({ message: "Schema field type is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly type: string;

  @ApiProperty({
    example: "Number of Leave Days",
    description: "Human-readable label shown to the client",
    required: true,
  })
  @MaxLength(100, { message: "Schema field label must not exceed 100 characters" })
  @MinLength(1, { message: "Schema field label must be at least 1 character long" })
  @IsString({ message: "Schema field label must be a string" })
  @IsNotEmpty({ message: "Schema field label is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly label: string;

  @ApiProperty({
    example: true,
    description: "Whether the field must be provided when creating a workflow instance",
    required: true,
  })
  @IsBoolean({ message: "Schema field required flag must be a boolean" })
  @IsNotEmpty({ message: "Schema field required flag is required" })
  readonly required: boolean;
}

export class CreateTransitionRuleDto {
  @ApiProperty({
    example: "amount-must-exceed-1000",
    description: "Human-readable name for the rule (1-100 characters)",
    minLength: 1,
    maxLength: 100,
    required: true,
  })
  @MaxLength(100, { message: "Rule name must not exceed 100 characters" })
  @MinLength(1, { message: "Rule name must be at least 1 character long" })
  @IsString({ message: "Rule name must be a string" })
  @IsNotEmpty({ message: "Rule name is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly ruleName: string;

  @ApiProperty({
    description: `Rule definition JSON AST for evaluation. Discover fixed facts, rule types, strategies, operators, and system paths from GET /workflow-rules/metadata. Discover workflow-specific payload keys from ${RULE_PAYLOAD_PATH_SOURCE}. For custom rules, set type to \"${RuleType.CUSTOM}\" and choose a supported strategy from the metadata endpoint.`,
    example: {
      all: [{ fact: RuleFactNamespace.PAYLOAD, path: "$.amount", operator: "greaterThan", value: 1000 }],
    },
    required: true,
  })
  @IsObject({ message: "Rule definition must be an object" })
  @IsNotEmpty({ message: "Rule definition is required" })
  readonly ruleDefinition: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "Evaluation order for rule execution (lower values evaluated first, default: 0)",
    example: 0,
    minimum: 0,
  })
  @Min(0, { message: "Evaluation order must be at least 0" })
  @IsInt({ message: "Evaluation order must be an integer" })
  @IsOptional()
  readonly evaluationOrder?: number;

  @ApiPropertyOptional({
    description:
      "Optional instance form fields to merge into the workflow definition schema. Required when ruleDefinition references payload fields.",
    type: [TransitionSchemaFieldDto],
  })
  @IsArray({ message: "Schema fields must be an array" })
  @ValidateNested({ each: true })
  @Type(() => TransitionSchemaFieldDto)
  @IsOptional()
  readonly schemaFields?: TransitionSchemaFieldDto[];
}
