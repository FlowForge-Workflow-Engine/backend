import { ApiProperty } from "@nestjs/swagger";
import { WorkflowDefinitionStatus } from "../../entities/workflow-definition.entity";

/**
 * Base Workflow Definition Response DTO
 * Includes all workflow definition properties for API responses
 */
export class WorkflowDefinitionResponseDto {
  @ApiProperty({ description: "Workflow definition unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ example: "Approval Workflow", description: "Human-readable name for the workflow" })
  name: string;

  @ApiProperty({
    example: "A workflow for approving purchase requests",
    description: "Optional description explaining workflow purpose",
    nullable: true,
  })
  description: string | null;

  @ApiProperty({ example: 1, description: "Current version number of the workflow" })
  currentVersion: number;

  @ApiProperty({
    enum: WorkflowDefinitionStatus,
    example: "draft",
    description: "Lifecycle status of the workflow",
  })
  status: WorkflowDefinitionStatus;

  @ApiProperty({ description: "ID of the user who created this definition", format: "uuid" })
  createdBy: string;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "Workflow definition creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Workflow definition last update timestamp" })
  updatedAt: Date;
}

/**
 * Workflow Definition List Response DTO
 * Used for GET /workflow-definitions endpoint
 */
export class WorkflowDefinitionListResponseDto extends WorkflowDefinitionResponseDto {}

/**
 * Workflow Definition Detail Response DTO
 * Used for GET /workflow-definitions/:id endpoint
 */
export class WorkflowDefinitionDetailResponseDto extends WorkflowDefinitionResponseDto {}

/**
 * Workflow Definition Created Response DTO
 * Used for POST /workflow-definitions endpoint
 */
export class WorkflowDefinitionCreatedResponseDto extends WorkflowDefinitionResponseDto {}

/**
 * Workflow Definition Published Response DTO
 * Used for POST /workflow-definitions/:id/publish endpoint.
 * Mirrors WorkflowDefinitionVersion entity (the publish service returns a version snapshot, not the definition).
 */
export class WorkflowDefinitionPublishedResponseDto {
  @ApiProperty({ description: "Version record unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ description: "ID of the parent workflow definition", format: "uuid" })
  workflowDefinitionId: string;

  @ApiProperty({ example: 1, description: "Sequential version number" })
  versionNumber: number;

  @ApiProperty({ description: "Full frozen snapshot of states, transitions and rules at publish time" })
  snapshot: Record<string, unknown>;

  @ApiProperty({ example: true, description: "Whether this version is the currently active one" })
  isActive: boolean;

  @ApiProperty({ description: "ID of the user who published this version", format: "uuid" })
  publishedBy: string;

  @ApiProperty({
    example: "2026-03-05T10:30:00Z",
    description: "Timestamp when version was published",
    nullable: true,
  })
  publishedAt: Date | null;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Version record creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Version record last update timestamp" })
  updatedAt: Date;
}

/**
 * Workflow Definition Deprecated Response DTO
 * Used for POST /workflow-definitions/:id/deprecate endpoint
 */
export class WorkflowDefinitionDeprecatedResponseDto extends WorkflowDefinitionResponseDto {}
