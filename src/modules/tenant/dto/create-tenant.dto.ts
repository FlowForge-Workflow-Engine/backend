import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { TenantPlan } from '../entities/tenant.entity';

export class CreateTenantDto {
  @ApiProperty({ description: 'Display name of the tenant', example: 'Acme Corp' })
  @MaxLength(255)
  @MinLength(2)
  @IsString()
  readonly name: string;

  @ApiProperty({
    description: 'Unique URL-safe slug identifier',
    example: 'acme-corp',
    pattern: '^[a-z0-9-]+$',
  })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  @MaxLength(100)
  @MinLength(2)
  @IsString()
  readonly slug: string;

  @ApiProperty({ enum: TenantPlan, description: 'Subscription plan' })
  @IsEnum(TenantPlan)
  readonly plan: TenantPlan;
}

