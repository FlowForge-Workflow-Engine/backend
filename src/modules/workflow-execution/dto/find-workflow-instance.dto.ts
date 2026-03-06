import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { PaginationDto } from "@app/shared/dto/pagination.dto";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

export class FindWorkflowInstanceDto extends PaginationDto {
  @ApiPropertyOptional({
    description: "Filter workflow instances by status",
    enum: WorkflowInstanceStatus,
  })
  @IsEnum(WorkflowInstanceStatus, {
    message: `Status must be one of: ${Object.values(WorkflowInstanceStatus).join(", ")}`,
  })
  @IsOptional()
  readonly status?: WorkflowInstanceStatus;

  @ApiPropertyOptional({
    description: "Filter workflow instances by workflow definition ID",
    format: "uuid",
  })
  @IsUUID("4", { message: "Workflow definition ID must be a valid UUID" })
  @IsOptional()
  readonly workflowDefinitionId?: string;
}