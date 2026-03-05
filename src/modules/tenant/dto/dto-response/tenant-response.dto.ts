import { ApiProperty } from "@nestjs/swagger";
import { TenantPlan } from "../../entities/tenant.entity";

/**
 * Base Tenant Response DTO
 * Includes all tenant properties for API responses
 */
export class TenantResponseDto {
  @ApiProperty({ description: "Tenant's unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ example: "Acme Corp", description: "Tenant's name" })
  name: string;

  @ApiProperty({ example: "acme-corp", description: "Tenant's URL-friendly slug" })
  slug: string;

  @ApiProperty({ enum: TenantPlan, example: "free", description: "Subscription plan level" })
  plan: TenantPlan;

  @ApiProperty({ example: true, description: "Whether the tenant is active" })
  isActive: boolean;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "Tenant creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Tenant last update timestamp" })
  updatedAt: Date;
}

/**
 * Tenant List Response DTO
 * Used for GET /tenants endpoint
 */
export class TenantListResponseDto extends TenantResponseDto {}

/**
 * Tenant Detail Response DTO
 * Used for GET /tenants/:id endpoint
 */
export class TenantDetailResponseDto extends TenantResponseDto {}

/**
 * Tenant Created Response DTO
 * Used for POST /tenants endpoint (201 Created)
 */
export class TenantCreatedResponseDto extends TenantResponseDto {}

/**
 * Tenant Updated Response DTO
 * Used for PATCH /tenants/:id endpoint
 */
export class TenantUpdatedResponseDto extends TenantResponseDto {}

