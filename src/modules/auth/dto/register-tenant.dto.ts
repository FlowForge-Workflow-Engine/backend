import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

/**
 * DTO for company (tenant) self-registration.
 * Creates: Tenant + TenantSettings + 3 default system roles + first Admin user.
 * All fields are required — this is a full atomic onboarding operation.
 */
export class RegisterTenantDto {
  @ApiProperty({ example: 'Acme Corporation', description: 'Human-readable company name' })
  @IsString()
  @MinLength(2)
  tenantName: string;

  @ApiProperty({
    example: 'acme-corp',
    description: 'URL-friendly unique slug for the company (lowercase letters, numbers, hyphens)',
  })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'tenantSlug must be lowercase letters, numbers, and hyphens only (e.g. acme-corp)',
  })
  tenantSlug: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'jane.smith@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cur3P@ss!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

