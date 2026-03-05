import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * Used by admins to create users within their own tenant.
 * tenantId is extracted from the JWT (never from the body) in the controller.
 */
export class CreateUserDto {
  @ApiProperty({
    example: "Jane",
    description: "First name of the user (1-50 characters)",
    minLength: 1,
    maxLength: 50,
    required: true,
  })
  @MaxLength(50, { message: "First name must not exceed 50 characters" })
  @MinLength(1, { message: "First name must be at least 1 character long" })
  @IsString({ message: "First name must be a string" })
  @IsNotEmpty({ message: "First name is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  firstName: string;

  @ApiProperty({
    example: "Smith",
    description: "Last name of the user (1-50 characters)",
    minLength: 1,
    maxLength: 50,
    required: true,
  })
  @MaxLength(50, { message: "Last name must not exceed 50 characters" })
  @MinLength(1, { message: "Last name must be at least 1 character long" })
  @IsString({ message: "Last name must be a string" })
  @IsNotEmpty({ message: "Last name is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  lastName: string;

  @ApiProperty({
    example: "jane.smith@acme.com",
    description: "Email address of the user (valid email format required)",
    required: true,
  })
  @MaxLength(255, { message: "Email must not exceed 255 characters" })
  @IsEmail({}, { message: "Email must be a valid email address" })
  @IsString({ message: "Email must be a string" })
  @IsNotEmpty({ message: "Email is required" })
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
  @Matches(/(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      "Password must contain at least one uppercase letter, one lowercase letter, and one number or special character",
  })
  @MaxLength(32, { message: "Password must not exceed 32 characters" })
  @MinLength(8, { message: "Password must be at least 8 characters long" })
  @IsString({ message: "Password must be a string" })
  @IsNotEmpty({ message: "Password is required" })
  password: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["Admin", "Viewer"],
    description: "Array of role names to assign to the user",
  })
  @IsString({ each: true, message: "Each role name must be a string" })
  @IsArray({ message: "Role names must be an array" })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => (typeof v === "string" ? v.trim() : v)) : value
  )
  roleNames?: string[];
}
