import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TenantPlan } from '../entities/tenant.entity';

export class UpdateTenantDto {
  @ApiPropertyOptional({ description: 'Display name of the tenant', example: 'Acme Corp Ltd' })
  @MaxLength(255)
  @MinLength(2)
  @IsString()
  @IsOptional()
  readonly name?: string;

  @ApiPropertyOptional({ enum: TenantPlan, description: 'Subscription plan' })
  @IsEnum(TenantPlan)
  @IsOptional()
  readonly plan?: TenantPlan;

  @ApiPropertyOptional({ description: 'Whether the tenant is active' })
  @IsBoolean()
  @IsOptional()
  readonly isActive?: boolean;
}

