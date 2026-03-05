import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEnum, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { TenantPlan } from "../entities/tenant.entity";

export class CreateTenantDto {
  @ApiProperty({
    description: "Display name of the tenant (2-255 characters)",
    example: "Acme Corp",
    minLength: 2,
    maxLength: 255,
    required: true,
  })
  @IsNotEmpty({ message: "Tenant name is required" })
  @IsString({ message: "Tenant name must be a string" })
  @MinLength(2, { message: "Tenant name must be at least 2 characters long" })
  @MaxLength(255, { message: "Tenant name must not exceed 255 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly name: string;

  @ApiProperty({
    description:
      "Unique URL-safe slug identifier (lowercase letters, numbers, hyphens only, 2-100 characters)",
    example: "acme-corp",
    pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    minLength: 2,
    maxLength: 100,
    required: true,
  })
  @IsNotEmpty({ message: "Tenant slug is required" })
  @IsString({ message: "Tenant slug must be a string" })
  @MinLength(2, { message: "Tenant slug must be at least 2 characters long" })
  @MaxLength(100, { message: "Tenant slug must not exceed 100 characters" })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Tenant slug must contain only lowercase letters, numbers, and hyphens (e.g., acme-corp)",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  readonly slug: string;

  @ApiProperty({
    enum: TenantPlan,
    description: "Subscription plan for the tenant",
    example: TenantPlan.FREE,
    required: true,
  })
  @IsNotEmpty({ message: "Tenant plan is required" })
  @IsEnum(TenantPlan, { message: `Tenant plan must be one of: ${Object.values(TenantPlan).join(", ")}` })
  readonly plan: TenantPlan;
}
