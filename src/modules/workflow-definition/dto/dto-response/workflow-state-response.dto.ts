import { ApiProperty } from "@nestjs/swagger";

/**
 * Workflow State Response DTO
 * Includes all workflow state properties for API responses
 */
export class WorkflowStateResponseDto {
  @ApiProperty({ description: "Workflow state unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ description: "Foreign key to workflow definition", format: "uuid" })
  workflowDefinitionId: string;

  @ApiProperty({ example: "Pending Approval", description: "Human-readable name for the state" })
  name: string;

  @ApiProperty({ example: true, description: "Whether this is the initial state of the workflow" })
  isInitial: boolean;

  @ApiProperty({ example: false, description: "Whether this is a terminal state (no outgoing transitions)" })
  isTerminal: boolean;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "Workflow state creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Workflow state last update timestamp" })
  updatedAt: Date;
}

/**
 * Workflow State List Response DTO
 * Used for GET /workflow-definitions/:id/states endpoint
 */
export class WorkflowStateListResponseDto extends WorkflowStateResponseDto {}

/**
 * Workflow State Detail Response DTO
 * Used for GET /workflow-definitions/:id/states/:stateId endpoint
 */
export class WorkflowStateDetailResponseDto extends WorkflowStateResponseDto {}

/**
 * Workflow State Created Response DTO
 * Used for POST /workflow-definitions/:id/states endpoint
 */
export class WorkflowStateCreatedResponseDto extends WorkflowStateResponseDto {}

