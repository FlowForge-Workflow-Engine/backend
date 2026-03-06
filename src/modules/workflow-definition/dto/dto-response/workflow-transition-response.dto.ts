import { ApiProperty } from "@nestjs/swagger";
import {
  RuleFactNamespace,
  RULE_PAYLOAD_PATH_SOURCE,
} from "@app/shared/interfaces/contracts/rule-engine.contract";

/**
 * Workflow Transition Response DTO
 * Includes all workflow transition properties for API responses
 */
export class WorkflowTransitionResponseDto {
  @ApiProperty({ description: "Workflow transition unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ description: "Foreign key to workflow definition", format: "uuid" })
  workflowDefinitionId: string;

  @ApiProperty({ example: "Approve Request", description: "Human-readable name for this transition" })
  name: string;

  @ApiProperty({ description: "Source state ID", format: "uuid" })
  fromStateId: string;

  @ApiProperty({ description: "Target state ID", format: "uuid" })
  toStateId: string;

  @ApiProperty({
    example: ["uuid-role-1"],
    description: "Role IDs allowed to execute this transition",
    type: [String],
  })
  allowedRoleIds: string[];

  @ApiProperty({
    example: false,
    description: "Whether a comment is required when executing this transition",
  })
  requiresComment: boolean;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "Workflow transition creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Workflow transition last update timestamp" })
  updatedAt: Date;
}

/**
 * Workflow Transition List Response DTO
 * Used for GET /workflow-definitions/:id/transitions endpoint
 */
export class WorkflowTransitionListResponseDto extends WorkflowTransitionResponseDto {}

/**
 * Workflow Transition Detail Response DTO
 * Used for GET /workflow-definitions/:id/transitions/:transitionId endpoint
 */
export class WorkflowTransitionDetailResponseDto extends WorkflowTransitionResponseDto {}

/**
 * Workflow Transition Created Response DTO
 * Used for POST /workflow-definitions/:id/transitions endpoint
 */
export class WorkflowTransitionCreatedResponseDto extends WorkflowTransitionResponseDto {}

/**
 * Workflow Transition Rule Response DTO
 * Includes all workflow transition rule properties for API responses
 */
export class WorkflowTransitionRuleResponseDto {
  @ApiProperty({ description: "Workflow transition rule unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ description: "Foreign key to workflow transition", format: "uuid" })
  transitionId: string;

  @ApiProperty({ example: "Approval Check", description: "Human-readable name for the rule" })
  ruleName: string;

  @ApiProperty({
    example: {
      all: [{ fact: RuleFactNamespace.PAYLOAD, path: "$.amount", operator: "greaterThan", value: 10000 }],
    },
    description: `json-rules-engine conditions AST. Fixed rule vocabulary is available from GET /workflow-rules/metadata. Workflow-specific payload keys come from ${RULE_PAYLOAD_PATH_SOURCE}.`,
  })
  ruleDefinition: Record<string, unknown>;

  @ApiProperty({ example: 0, description: "Order of evaluation when multiple rules exist (lower = first)" })
  evaluationOrder: number;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "Rule creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Rule last update timestamp" })
  updatedAt: Date;
}

/**
 * Workflow Transition Rule List Response DTO
 * Used for GET /workflow-definitions/:id/transitions/:transitionId/rules endpoint
 */
export class WorkflowTransitionRuleListResponseDto extends WorkflowTransitionRuleResponseDto {}

/**
 * Workflow Transition Rule Created Response DTO
 * Used for POST /workflow-definitions/:id/transitions/:transitionId/rules endpoint
 */
export class WorkflowTransitionRuleCreatedResponseDto extends WorkflowTransitionRuleResponseDto {}
