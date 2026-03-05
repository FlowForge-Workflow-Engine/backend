import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({
    description: "Maximum number of workflow definitions allowed (1-1000)",
    example: 10,
    minimum: 1,
    maximum: 1000,
  })
  @IsOptional()
  @IsInt({ message: "Max workflow definitions must be an integer" })
  @Min(1, { message: "Max workflow definitions must be at least 1" })
  @Max(1000, { message: "Max workflow definitions must not exceed 1000" })
  readonly maxWorkflowDefinitions?: number;

  @ApiPropertyOptional({
    description: "Maximum number of users allowed (1-10000)",
    example: 50,
    minimum: 1,
    maximum: 10000,
  })
  @IsOptional()
  @IsInt({ message: "Max users must be an integer" })
  @Min(1, { message: "Max users must be at least 1" })
  @Max(10000, { message: "Max users must not exceed 10000" })
  readonly maxUsers?: number;

  @ApiPropertyOptional({
    description: "Branding configuration (colors, logo URL, etc.)",
    example: { primaryColor: "#2563EB", logoUrl: "https://cdn.example.com/logo.png" },
  })
  @IsOptional()
  @IsObject({ message: "Branding must be an object" })
  readonly branding?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "IANA timezone identifier (max 50 characters)",
    example: "America/New_York",
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: "Timezone must be a string" })
  @MaxLength(50, { message: "Timezone must not exceed 50 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly timezone?: string;
}
