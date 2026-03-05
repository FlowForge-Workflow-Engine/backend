import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Used by admins to create users within their own tenant.
 * tenantId is extracted from the JWT (never from the body) in the controller.
 */
export class CreateUserDto {
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

  @ApiPropertyOptional({ type: [String], example: ['Admin', 'Viewer'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleNames?: string[];
}

