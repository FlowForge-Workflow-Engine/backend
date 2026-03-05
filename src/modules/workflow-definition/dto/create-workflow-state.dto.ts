import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateWorkflowStateDto {
  @ApiProperty({
    example: "Pending Approval",
    description: "Human-readable name for the workflow state (1-100 characters)",
    minLength: 1,
    maxLength: 100,
    required: true,
  })
  @IsNotEmpty({ message: "State name is required" })
  @IsString({ message: "State name must be a string" })
  @MinLength(1, { message: "State name must be at least 1 character long" })
  @MaxLength(100, { message: "State name must not exceed 100 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly name: string;

  @ApiPropertyOptional({
    description: "Optional description explaining the state purpose (max 500 characters)",
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: "State description must be a string" })
  @MaxLength(500, { message: "State description must not exceed 500 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly description?: string;

  @ApiPropertyOptional({
    description: "Whether this is the initial state of the workflow",
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: "isInitial must be a boolean" })
  readonly isInitial?: boolean;

  @ApiPropertyOptional({
    description: "Whether this is a terminal (end) state of the workflow",
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: "isTerminal must be a boolean" })
  readonly isTerminal?: boolean;

  @ApiPropertyOptional({
    description: "X coordinate for visual positioning in workflow diagram",
    example: 100,
  })
  @IsOptional()
  @IsNumber({}, { message: "positionX must be a number" })
  readonly positionX?: number;

  @ApiPropertyOptional({
    description: "Y coordinate for visual positioning in workflow diagram",
    example: 200,
  })
  @IsOptional()
  @IsNumber({}, { message: "positionY must be a number" })
  readonly positionY?: number;

  @ApiPropertyOptional({
    example: { color: "#FF5733", icon: "clock" },
    description: "Additional metadata for the state (e.g., color, icon)",
  })
  @IsOptional()
  @IsObject({ message: "Metadata must be an object" })
  readonly metadata?: Record<string, unknown>;
}
