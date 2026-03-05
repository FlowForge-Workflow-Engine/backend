import { ApiProperty } from "@nestjs/swagger";
import { NotificationChannel } from "../../entities/notification-template.entity";

/**
 * Notification Template Response DTO
 * Includes all notification template properties for API responses
 */
export class NotificationTemplateResponseDto {
  @ApiProperty({ description: "Notification template unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({
    example: "workflow-execution.transition.completed",
    description: "NATS event name that triggers this notification",
  })
  eventTrigger: string;

  @ApiProperty({
    enum: NotificationChannel,
    example: NotificationChannel.EMAIL,
    description: "Delivery channel for the notification",
  })
  channel: NotificationChannel;

  @ApiProperty({
    example: "Your request {{requestId}} has been approved",
    description: "Handlebars subject template (null for webhook channel)",
    nullable: true,
  })
  subjectTemplate: string | null;

  @ApiProperty({
    example: "Hello {{name}}, your workflow has transitioned to {{state}}.",
    description: "Handlebars body template or webhook payload JSON",
  })
  bodyTemplate: string;

  @ApiProperty({ example: true, description: "Whether this notification template is active" })
  isActive: boolean;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "Template creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "Template last update timestamp" })
  updatedAt: Date;
}

/**
 * Notification Template List Response DTO
 * Used for GET /notification-templates endpoint
 */
export class NotificationTemplateListResponseDto extends NotificationTemplateResponseDto {}

/**
 * Notification Template Detail Response DTO
 * Used for GET /notification-templates/:id endpoint
 */
export class NotificationTemplateDetailResponseDto extends NotificationTemplateResponseDto {}

/**
 * Notification Template Created Response DTO
 * Used for POST /notification-templates endpoint
 */
export class NotificationTemplateCreatedResponseDto extends NotificationTemplateResponseDto {}

/**
 * Notification Template Updated Response DTO
 * Used for PATCH /notification-templates/:id endpoint
 */
export class NotificationTemplateUpdatedResponseDto extends NotificationTemplateResponseDto {}
