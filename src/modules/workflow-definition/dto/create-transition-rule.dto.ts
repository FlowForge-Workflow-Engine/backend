import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateTransitionRuleDto {
  @ApiProperty({ example: "amount-must-exceed-1000" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  readonly ruleName: string;

  @ApiProperty({
    description: "json-rules-engine conditions AST",
    example: {
      all: [{ fact: "payload", path: "$.amount", operator: "greaterThan", value: 1000 }],
    },
  })
  @IsObject()
  readonly ruleDefinition: Record<string, unknown>;

  @ApiPropertyOptional({ default: 0, description: "Lower = evaluated first" })
  @IsInt()
  @Min(0)
  @IsOptional()
  readonly evaluationOrder?: number;
}
