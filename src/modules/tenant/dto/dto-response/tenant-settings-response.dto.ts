import { ApiProperty } from "@nestjs/swagger";

/**
 * Tenant Settings Response DTO
 * Includes all tenant settings properties for API responses
 */
export class TenantSettingsResponseDto {
  @ApiProperty({ description: "Settings unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ example: 10, description: "Maximum number of workflow definitions allowed" })
  maxWorkflowDefinitions: number;

  @ApiProperty({ example: 50, description: "Maximum number of users allowed" })
  maxUsers: number;

  @ApiProperty({
    example: { logo: "https://example.com/logo.png", primaryColor: "#000000" },
    description: "Custom branding configuration",
    nullable: true,
  })
  branding: Record<string, unknown> | null;

  @ApiProperty({ example: "UTC", description: "Tenant's preferred timezone" })
  timezone: string;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Settings last update timestamp" })
  updatedAt: Date;
}

/**
 * Tenant Feature Flag Response DTO
 * Includes all feature flag properties for API responses
 */
export class TenantFeatureFlagResponseDto {
  @ApiProperty({ description: "Feature flag unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ example: "enable_webhooks", description: "Unique identifier for the feature flag" })
  flagKey: string;

  @ApiProperty({ example: true, description: "Whether the feature is enabled for this tenant" })
  isEnabled: boolean;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "Feature flag creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Feature flag last update timestamp" })
  updatedAt: Date;
}

/**
 * Tenant Feature Flag List Response DTO
 * Used for GET /tenants/:id/feature-flags endpoint
 */
export class TenantFeatureFlagListResponseDto extends TenantFeatureFlagResponseDto {}

/**
 * Tenant Feature Flag Created Response DTO
 * Used for POST /tenants/:id/feature-flags endpoint
 */
export class TenantFeatureFlagCreatedResponseDto extends TenantFeatureFlagResponseDto {}

/**
 * Tenant Feature Flag Updated Response DTO
 * Used for PATCH /tenants/:id/feature-flags/:key endpoint
 */
export class TenantFeatureFlagUpdatedResponseDto extends TenantFeatureFlagResponseDto {}
