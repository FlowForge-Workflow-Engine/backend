import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateRoleDto {
  @ApiProperty({
    example: "Finance Reviewer",
    description: "Role name unique within the tenant (1-100 characters)",
    minLength: 1,
    maxLength: 100,
    required: true,
  })
  @MaxLength(100, { message: "Role name must not exceed 100 characters" })
  @MinLength(1, { message: "Role name must be at least 1 character long" })
  @IsString({ message: "Role name must be a string" })
  @IsNotEmpty({ message: "Role name is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly name: string;

  @ApiPropertyOptional({
    example: "Can review and approve finance-related workflow steps",
    description: "Optional description explaining the role purpose",
    maxLength: 255,
    nullable: true,
  })
  @MaxLength(255, { message: "Role description must not exceed 255 characters" })
  @IsString({ message: "Role description must be a string" })
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly description?: string | null;
}