import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class ExecuteTransitionDto {
  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "UUID of the transition to execute",
    format: "uuid",
    required: true,
  })
  @IsNotEmpty({ message: "Transition ID is required" })
  @IsUUID("4", { message: "Transition ID must be a valid UUID" })
  readonly transitionId: string;

  @ApiProperty({
    description: "Current optimistic lock version of the instance — prevents concurrent transitions",
    example: 1,
    minimum: 1,
    required: true,
  })
  @IsNotEmpty({ message: "Expected version is required" })
  @IsInt({ message: "Expected version must be an integer" })
  @Min(1, { message: "Expected version must be at least 1" })
  @Max(2147483647, { message: "Expected version must not exceed maximum integer value" })
  readonly expectedVersion: number;

  @ApiPropertyOptional({
    description: "Optional comment explaining the transition (max 1000 characters)",
    example: "Approved — all documents verified.",
    maxLength: 1000,
  })
  @IsOptional()
  @IsString({ message: "Comment must be a string" })
  @MaxLength(1000, { message: "Comment must not exceed 1000 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly comment?: string;

  @ApiPropertyOptional({
    description: "Client-generated unique key to prevent duplicate transitions on retry (max 128 characters)",
    example: "req-abc123",
    maxLength: 128,
  })
  @IsOptional()
  @IsString({ message: "Idempotency key must be a string" })
  @MaxLength(128, { message: "Idempotency key must not exceed 128 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly idempotencyKey?: string;
}
