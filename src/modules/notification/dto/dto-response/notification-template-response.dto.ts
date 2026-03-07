import { ApiProperty } from "@nestjs/swagger";
import { NotificationChannel } from "../../entities/notification-template.entity";
import { NotificationEventTrigger } from "../../constants/notification-event-trigger.enum";

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
    enum: NotificationEventTrigger,
    example: NotificationEventTrigger.WORKFLOW_TRANSITION_COMPLETED,
    description: "Supported workflow event that triggers this notification",
  })
  eventTrigger: NotificationEventTrigger;

  @ApiProperty({
    enum: NotificationChannel,
    example: NotificationChannel.EMAIL,
    description: "Delivery channel for the notification",
  })
  channel: NotificationChannel;

  @ApiProperty({
    example: "Workflow moved to {{toState}}",
    description: "Email subject template with lightweight token interpolation (null for webhook channel)",
    nullable: true,
  })
  subjectTemplate: string | null;

  @ApiProperty({
    example: "workflow-transition-completed",
    description: "Pug template file name/path for email notifications or webhook payload template content",
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
