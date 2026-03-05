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
  @MaxLength(100, { message: "State name must not exceed 100 characters" })
  @MinLength(1, { message: "State name must be at least 1 character long" })
  @IsString({ message: "State name must be a string" })
  @IsNotEmpty({ message: "State name is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly name: string;

  @ApiPropertyOptional({
    description: "Optional description explaining the state purpose (max 500 characters)",
    maxLength: 500,
  })
  @MaxLength(500, { message: "State description must not exceed 500 characters" })
  @IsString({ message: "State description must be a string" })
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly description?: string;

  @ApiPropertyOptional({
    description: "Whether this is the initial state of the workflow",
    example: false,
  })
  @IsBoolean({ message: "isInitial must be a boolean" })
  @IsOptional()
  readonly isInitial?: boolean;

  @ApiPropertyOptional({
    description: "Whether this is a terminal (end) state of the workflow",
    example: false,
  })
  @IsBoolean({ message: "isTerminal must be a boolean" })
  @IsOptional()
  readonly isTerminal?: boolean;

  @ApiPropertyOptional({
    description: "X coordinate for visual positioning in workflow diagram",
    example: 100,
  })
  @IsNumber({}, { message: "positionX must be a number" })
  @IsOptional()
  readonly positionX?: number;

  @ApiPropertyOptional({
    description: "Y coordinate for visual positioning in workflow diagram",
    example: 200,
  })
  @IsNumber({}, { message: "positionY must be a number" })
  @IsOptional()
  readonly positionY?: number;

  @ApiPropertyOptional({
    example: { color: "#FF5733", icon: "clock" },
    description: "Additional metadata for the state (e.g., color, icon)",
  })
  @IsObject({ message: "Metadata must be an object" })
  @IsOptional()
  readonly metadata?: Record<string, unknown>;
}
