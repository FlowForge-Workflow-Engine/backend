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

  @ApiProperty({
    example: "Used when a request is waiting for manager action",
    description: "Optional description explaining the state purpose",
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    example: 120,
    description: "X coordinate for visual positioning in the workflow diagram",
    nullable: true,
  })
  positionX: number | null;

  @ApiProperty({
    example: 240,
    description: "Y coordinate for visual positioning in the workflow diagram",
    nullable: true,
  })
  positionY: number | null;

  @ApiProperty({
    example: { color: "#FF5733", icon: "clock" },
    description: "Additional display metadata for the state",
    nullable: true,
  })
  metadata: Record<string, unknown> | null;

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

/**
 * Workflow State Updated Response DTO
 * Used for PATCH /workflow-definitions/:id/states/:stateId endpoint
 */
export class WorkflowStateUpdatedResponseDto extends WorkflowStateResponseDto {}
