import { ApiProperty } from "@nestjs/swagger";

/**
 * Webhook Config Response DTO
 * Mirrors the WebhookConfig entity fields.
 */
export class WebhookConfigResponseDto {
  @ApiProperty({ description: "Webhook configuration unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ example: "My Webhook", description: "Human-readable name for the webhook configuration" })
  name: string;

  @ApiProperty({
    example: "https://example.com/webhooks/workflow",
    description: "Target URL for HTTP POST delivery",
  })
  url: string;

  @ApiProperty({ example: "hmac-secret-key", description: "HMAC-SHA256 signing secret" })
  secret: string;

  @ApiProperty({
    example: ["workflow-execution.transition.completed"],
    description: "Array of NATS event names this webhook subscribes to",
    type: [String],
  })
  eventTriggers: string[];

  @ApiProperty({ example: true, description: "Whether this webhook configuration is active" })
  isActive: boolean;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "Webhook configuration creation timestamp" })
  createdAt: Date;

  @ApiProperty({
    example: "2026-03-05T10:30:00Z",
    description: "Webhook configuration last update timestamp",
  })
  updatedAt: Date;
}

/**
 * Webhook Config List Response DTO
 * Used for GET /webhook-configs endpoint
 */
export class WebhookConfigListResponseDto extends WebhookConfigResponseDto {}

/**
 * Webhook Config Detail Response DTO
 * Used for GET /webhook-configs/:id endpoint
 */
export class WebhookConfigDetailResponseDto extends WebhookConfigResponseDto {}

/**
 * Webhook Config Created Response DTO
 * Used for POST /webhook-configs endpoint
 */
export class WebhookConfigCreatedResponseDto extends WebhookConfigResponseDto {}

/**
 * Webhook Config Updated Response DTO
 * Used for PATCH /webhook-configs/:id endpoint
 */
export class WebhookConfigUpdatedResponseDto extends WebhookConfigResponseDto {}
