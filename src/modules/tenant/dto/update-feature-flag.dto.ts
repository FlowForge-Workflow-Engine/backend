import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsObject, IsOptional } from "class-validator";

export class UpdateFeatureFlagDto {
  @ApiPropertyOptional({ description: "Whether the feature flag is enabled", example: true })
  @IsBoolean()
  @IsOptional()
  readonly isEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Additional configuration payload for the flag",
    example: { maxCalls: 200 },
  })
  @IsObject()
  @IsOptional()
  readonly config?: Record<string, unknown>;
}
