import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

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
    description: "json-rules-engine conditions AST for rule evaluation",
    example: {
      all: [{ fact: "payload", path: "$.amount", operator: "greaterThan", value: 1000 }],
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
}
