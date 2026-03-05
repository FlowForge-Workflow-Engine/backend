import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({ description: "Maximum number of workflow definitions allowed", example: 10 })
  @Max(1000)
  @Min(1)
  @IsInt()
  @IsOptional()
  readonly maxWorkflowDefinitions?: number;

  @ApiPropertyOptional({ description: "Maximum number of users allowed", example: 50 })
  @Max(10000)
  @Min(1)
  @IsInt()
  @IsOptional()
  readonly maxUsers?: number;

  @ApiPropertyOptional({
    description: "Branding configuration (colors, logo URL, etc.)",
    example: { primaryColor: "#2563EB", logoUrl: "https://cdn.example.com/logo.png" },
  })
  @IsObject()
  @IsOptional()
  readonly branding?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "IANA timezone identifier", example: "America/New_York" })
  @MaxLength(50)
  @IsString()
  @IsOptional()
  readonly timezone?: string;
}
