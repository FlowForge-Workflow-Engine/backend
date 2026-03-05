import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { TenantPlan } from "../entities/tenant.entity";

export class UpdateTenantDto {
  @ApiPropertyOptional({
    description: "Display name of the tenant (2-255 characters)",
    example: "Acme Corp Ltd",
    minLength: 2,
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: "Tenant name must be a string" })
  @MinLength(2, { message: "Tenant name must be at least 2 characters long" })
  @MaxLength(255, { message: "Tenant name must not exceed 255 characters" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly name?: string;

  @ApiPropertyOptional({
    enum: TenantPlan,
    description: "Subscription plan for the tenant",
    example: TenantPlan.PRO,
  })
  @IsOptional()
  @IsEnum(TenantPlan, { message: `Tenant plan must be one of: ${Object.values(TenantPlan).join(", ")}` })
  readonly plan?: TenantPlan;

  @ApiPropertyOptional({
    description: "Whether the tenant is active",
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: "isActive must be a boolean" })
  readonly isActive?: boolean;
}
