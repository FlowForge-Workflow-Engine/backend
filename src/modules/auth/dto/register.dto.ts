import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from "class-validator";

/**
 * Used by employee self-registration to join an existing company.
 * tenantSlug is the URL-friendly identifier (e.g. 'acme-corp') — no UUID exposure.
 */
export class RegisterDto {
  @ApiProperty({
    example: "John",
    description: "First name of the user (1-50 characters)",
    minLength: 1,
    maxLength: 50,
    required: true,
  })
  @IsNotEmpty({ message: "First name is required" })
  @IsString({ message: "First name must be a string" })
  @MinLength(1, { message: "First name must be at least 1 character long" })
  @MaxLength(50, { message: "First name must not exceed 50 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  firstName: string;

  @ApiProperty({
    example: "Doe",
    description: "Last name of the user (1-50 characters)",
    minLength: 1,
    maxLength: 50,
    required: true,
  })
  @IsNotEmpty({ message: "Last name is required" })
  @IsString({ message: "Last name must be a string" })
  @MinLength(1, { message: "Last name must be at least 1 character long" })
  @MaxLength(50, { message: "Last name must not exceed 50 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  lastName: string;

  @ApiProperty({
    example: "john.doe@acme.com",
    description: "Email address of the user (valid email format required)",
    required: true,
  })
  @IsNotEmpty({ message: "Email is required" })
  @IsString({ message: "Email must be a string" })
  @IsEmail({}, { message: "Email must be a valid email address" })
  @MaxLength(255, { message: "Email must not exceed 255 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({
    example: "S3cur3P@ss!",
    description:
      "Password for the user account (8-32 characters, must contain uppercase, lowercase, number or special character)",
    minLength: 8,
    maxLength: 32,
    required: true,
  })
  @IsNotEmpty({ message: "Password is required" })
  @IsString({ message: "Password must be a string" })
  @MinLength(8, { message: "Password must be at least 8 characters long" })
  @MaxLength(32, { message: "Password must not exceed 32 characters" })
  @Matches(/(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      "Password must contain at least one uppercase letter, one lowercase letter, and one number or special character",
  })
  password: string;

  @ApiProperty({
    example: "acme-corp",
    description: "URL-friendly slug of the company to join (lowercase letters, numbers, hyphens only)",
    required: true,
  })
  @IsNotEmpty({ message: "Tenant slug is required" })
  @IsString({ message: "Tenant slug must be a string" })
  @MinLength(3, { message: "Tenant slug must be at least 3 characters long" })
  @MaxLength(50, { message: "Tenant slug must not exceed 50 characters" })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Tenant slug must contain only lowercase letters, numbers, and hyphens (e.g., acme-corp)",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  tenantSlug: string;
}
