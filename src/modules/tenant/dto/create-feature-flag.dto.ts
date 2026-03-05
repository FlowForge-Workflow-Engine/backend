import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateFeatureFlagDto {
  @ApiProperty({
    description: 'Feature flag key (snake_case)',
    example: 'enable_webhooks',
    pattern: '^[a-z0-9_]+$',
  })
  @Matches(/^[a-z0-9_]+$/, {
    message: 'flagKey must contain only lowercase letters, numbers, and underscores',
  })
  @MaxLength(100)
  @IsString()
  readonly flagKey: string;

  @ApiProperty({ description: 'Whether the feature flag is enabled', example: false })
  @IsBoolean()
  readonly isEnabled: boolean;

  @ApiPropertyOptional({
    description: 'Additional configuration payload for the flag',
    example: { maxCalls: 100, endpoint: 'https://hooks.example.com' },
  })
  @IsObject()
  @IsOptional()
  readonly config?: Record<string, unknown>;
}

