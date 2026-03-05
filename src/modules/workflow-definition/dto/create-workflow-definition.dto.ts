import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateWorkflowDefinitionDto {
  @ApiProperty({
    example: "Leave Approval Workflow",
    description: "Human-readable name for the workflow (1-255 characters)",
    minLength: 1,
    maxLength: 255,
    required: true,
  })
  @MaxLength(255, { message: "Workflow name must not exceed 255 characters" })
  @MinLength(1, { message: "Workflow name must be at least 1 character long" })
  @IsString({ message: "Workflow name must be a string" })
  @IsNotEmpty({ message: "Workflow name is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly name: string;

  @ApiPropertyOptional({
    example: "Handles employee leave requests end-to-end.",
    description: "Optional description explaining the workflow purpose (max 1000 characters)",
    maxLength: 1000,
  })
  @MaxLength(1000, { message: "Workflow description must not exceed 1000 characters" })
  @IsString({ message: "Workflow description must be a string" })
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly description?: string;
}
