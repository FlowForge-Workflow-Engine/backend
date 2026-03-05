import { ApiProperty } from "@nestjs/swagger";
import { WorkflowInstanceStatus } from "../../enums/workflow-instance-status";

/**
 * Workflow Execution Response DTO
 * Mirrors the WorkflowInstance entity fields.
 */
export class WorkflowExecutionResponseDto {
  @ApiProperty({ description: "Workflow instance unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ description: "Foreign key to workflow definition", format: "uuid" })
  workflowDefinitionId: string;

  @ApiProperty({ example: 1, description: "Version of the definition snapshot used at creation time" })
  definitionVersion: number;

  @ApiProperty({ description: "Current state ID in the workflow state machine", format: "uuid" })
  currentStateId: string;

  @ApiProperty({ example: "pending_approval", description: "Denormalized current state name for fast reads" })
  currentStateName: string;

  @ApiProperty({
    example: { requestId: "REQ-001", amount: 5000 },
    description: "Dynamic business context payload",
  })
  payload: Record<string, unknown>;

  @ApiProperty({
    enum: WorkflowInstanceStatus,
    example: WorkflowInstanceStatus.ACTIVE,
    description: "Current lifecycle status of the instance",
  })
  status: WorkflowInstanceStatus;

  @ApiProperty({
    example: 1,
    description: "Optimistic lock counter, incremented on each successful transition",
  })
  version: number;

  @ApiProperty({ description: "UUID of the user who created this instance", format: "uuid" })
  createdBy: string;

  @ApiProperty({
    example: "2026-03-05T10:30:00Z",
    description: "Timestamp when instance reached terminal state",
    nullable: true,
  })
  completedAt: Date | null;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "Instance creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Instance last update timestamp" })
  updatedAt: Date;
}

/**
 * Workflow Execution List Response DTO
 * Used for GET /workflow-executions endpoint
 */
export class WorkflowExecutionListResponseDto extends WorkflowExecutionResponseDto {}

/**
 * Workflow Execution Detail Response DTO
 * Used for GET /workflow-executions/:id endpoint
 */
export class WorkflowExecutionDetailResponseDto extends WorkflowExecutionResponseDto {}

/**
 * Workflow Execution Created Response DTO
 * Used for POST /workflow-executions endpoint
 */
export class WorkflowExecutionCreatedResponseDto extends WorkflowExecutionResponseDto {}

/**
 * Workflow Execution Transitioned Response DTO
 * Used for POST /workflow-executions/:id/transition endpoint
 */
export class WorkflowExecutionTransitionedResponseDto extends WorkflowExecutionResponseDto {}
