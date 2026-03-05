import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({
    example: "user@acme.com",
    description: "Email address of the user",
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
    description: "Password for the user account (8-32 characters)",
    minLength: 8,
    maxLength: 32,
    required: true,
  })
  @MaxLength(32, { message: "Password must not exceed 32 characters" })
  @MinLength(8, { message: "Password must be at least 8 characters long" })
  @IsString({ message: "Password must be a string" })
  @IsNotEmpty({ message: "Password is required" })
  password: string;

  @ApiProperty({
    example: "123e4567-e89b-12d3-a456-426614174000",
    description: "Tenant ID for multi-tenancy isolation",
    required: true,
  })
  @IsUUID("4")
  @IsString({ message: "Tenant ID must be a string" })
  @IsNotEmpty({ message: "Tenant ID is required" })
  tenantId: string;
}
