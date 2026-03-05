import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateWorkflowTransitionDto {
  @ApiProperty({
    example: "Submit for Approval",
    description: "Human-readable name for the transition (1-100 characters)",
    minLength: 1,
    maxLength: 100,
    required: true,
  })
  @IsNotEmpty({ message: "Transition name is required" })
  @IsString({ message: "Transition name must be a string" })
  @MinLength(1, { message: "Transition name must be at least 1 character long" })
  @MaxLength(100, { message: "Transition name must not exceed 100 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly name: string;

  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "UUID of the source state for this transition",
    format: "uuid",
    required: true,
  })
  @IsNotEmpty({ message: "From state ID is required" })
  @IsUUID("4", { message: "From state ID must be a valid UUID" })
  readonly fromStateId: string;

  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440001",
    description: "UUID of the destination state for this transition",
    format: "uuid",
    required: true,
  })
  @IsNotEmpty({ message: "To state ID is required" })
  @IsUUID("4", { message: "To state ID must be a valid UUID" })
  readonly toStateId: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["550e8400-e29b-41d4-a716-446655440002", "550e8400-e29b-41d4-a716-446655440003"],
    description:
      "Array of role UUIDs allowed to trigger this transition. Empty array = any role can trigger.",
  })
  @IsOptional()
  @IsArray({ message: "Allowed role IDs must be an array" })
  @IsUUID("4", { each: true, message: "Each role ID must be a valid UUID" })
  readonly allowedRoleIds?: string[];

  @ApiPropertyOptional({
    description: "Whether a comment is required when executing this transition",
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: "requiresComment must be a boolean" })
  readonly requiresComment?: boolean;
}
