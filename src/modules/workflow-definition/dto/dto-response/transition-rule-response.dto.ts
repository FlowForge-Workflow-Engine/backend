import { ApiProperty } from "@nestjs/swagger";

export class TransitionRuleDto {
  @ApiProperty({ description: "Workflow definition unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  /** Foreign key to workflow transition - links rule to specific transition */
  @ApiProperty({ description: "Foreign key to workflow transition", format: "uuid" })
  transitionId: string;

  /** Human-readable name for the rule - describes rule purpose */
  @ApiProperty({ example: "Approval Check", description: "Human-readable name for the rule" })
  ruleName: string;

  /**
   * json-rules-engine conditions AST - defines business logic for transition execution
   * Shape: { all: [...] } | { any: [...] } | { not: {...} }
   */
  @ApiProperty({
    example: { all: [{ fact: "amount", operator: "lessThanInclusive", value: 10000 }] },
    description: "json-rules-engine conditions AST",
  })
  ruleDefinition: Record<string, unknown>;

  /** Order of rule evaluation when multiple rules exist - controls rule precedence */
  @ApiProperty({ example: 0, description: "Order of evaluation when multiple rules exist (lower = first)" })
  evaluationOrder: number;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "Rule creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Rule last update timestamp" })
  updatedAt: Date;
}

/**
 * Transition Rule List Response DTO
 * Used for GET /workflow-definitions endpoint
 */
export class TransitionRuleListResponseDto extends TransitionRuleDto {}
