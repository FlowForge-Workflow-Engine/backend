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
  @IsNotEmpty({ message: "Workflow name is required" })
  @IsString({ message: "Workflow name must be a string" })
  @MinLength(1, { message: "Workflow name must be at least 1 character long" })
  @MaxLength(255, { message: "Workflow name must not exceed 255 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly name: string;

  @ApiPropertyOptional({
    example: "Handles employee leave requests end-to-end.",
    description: "Optional description explaining the workflow purpose (max 1000 characters)",
    maxLength: 1000,
  })
  @IsOptional()
  @IsString({ message: "Workflow description must be a string" })
  @MaxLength(1000, { message: "Workflow description must not exceed 1000 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly description?: string;
}
