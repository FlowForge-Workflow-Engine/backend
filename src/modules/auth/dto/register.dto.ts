import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

/**
 * Used by employee self-registration to join an existing company.
 * tenantSlug is the URL-friendly identifier (e.g. 'acme-corp') — no UUID exposure.
 */
export class RegisterDto {
  @ApiProperty({ example: "John" })
  @IsString()
  firstName: string;

  @ApiProperty({ example: "Doe" })
  @IsString()
  lastName: string;

  @ApiProperty({ example: "john.doe@acme.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "S3cur3P@ss!", minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: "acme-corp", description: "URL-friendly slug of the company to join" })
  @IsString()
  tenantSlug: string;
}
