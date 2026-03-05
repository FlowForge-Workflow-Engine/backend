import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

/**
 * Used by the self-registration flow where a user creates a new tenant + account.
 * tenantId is provided by the API gateway / onboarding service after tenant creation.
 */
export class RegisterDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'john.doe@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cur3P@ss!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: 'UUID of the tenant to register under', format: 'uuid' })
  @IsUUID('4')
  tenantId: string;
}

