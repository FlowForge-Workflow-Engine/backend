import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsObject, IsOptional } from "class-validator";

export class UpdateFeatureFlagDto {
  @ApiPropertyOptional({
    description: "Whether the feature flag is enabled",
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: "isEnabled must be a boolean" })
  readonly isEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Additional configuration payload for the flag",
    example: { maxCalls: 200 },
  })
  @IsOptional()
  @IsObject({ message: "Config must be an object" })
  readonly config?: Record<string, unknown>;
}
