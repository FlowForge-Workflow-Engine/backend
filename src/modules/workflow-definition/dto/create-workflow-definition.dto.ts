import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateWorkflowDefinitionDto {
  @ApiProperty({ example: "Leave Approval Workflow" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly name: string;

  @ApiPropertyOptional({ example: "Handles employee leave requests end-to-end." })
  @IsString()
  @IsOptional()
  readonly description?: string;
}
