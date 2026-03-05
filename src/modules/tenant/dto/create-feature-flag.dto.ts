import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateFeatureFlagDto {
  @ApiProperty({
    description:
      "Feature flag key in snake_case (lowercase letters, numbers, underscores only, 1-100 characters)",
    example: "enable_webhooks",
    pattern: "^[a-z0-9_]+$",
    minLength: 1,
    maxLength: 100,
    required: true,
  })
  @Matches(/^[a-z0-9_]+$/, {
    message: "Feature flag key must contain only lowercase letters, numbers, and underscores",
  })
  @MaxLength(100, { message: "Feature flag key must not exceed 100 characters" })
  @MinLength(1, { message: "Feature flag key must be at least 1 character long" })
  @IsString({ message: "Feature flag key must be a string" })
  @IsNotEmpty({ message: "Feature flag key is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  readonly flagKey: string;

  @ApiProperty({
    description: "Whether the feature flag is enabled",
    example: false,
    required: true,
  })
  @IsBoolean({ message: "isEnabled must be a boolean" })
  @IsNotEmpty({ message: "isEnabled is required" })
  readonly isEnabled: boolean;

  @ApiPropertyOptional({
    description: "Additional configuration payload for the flag",
    example: { maxCalls: 100, endpoint: "https://hooks.example.com" },
  })
  @IsObject({ message: "Config must be an object" })
  @IsOptional()
  readonly config?: Record<string, unknown>;
}
