import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { NotificationChannel } from "../entities/notification-template.entity";
import { NotificationEventTrigger } from "../constants/notification-event-trigger.enum";

export class CreateNotificationTemplateDto {
  @ApiProperty({
    enum: NotificationEventTrigger,
    example: NotificationEventTrigger.TENANT_CREATED,
    description: "Supported event trigger that dispatches this notification",
    minLength: 1,
    maxLength: 100,
    required: true,
  })
  @MaxLength(100, { message: "Event trigger must not exceed 100 characters" })
  @MinLength(1, { message: "Event trigger must be at least 1 character long" })
  @IsEnum(NotificationEventTrigger, {
    message: `Event trigger must be one of: ${Object.values(NotificationEventTrigger).join(", ")}`,
  })
  @IsNotEmpty({ message: "Event trigger is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly eventTrigger: NotificationEventTrigger;

  @ApiProperty({
    enum: NotificationChannel,
    description: "Delivery channel for the notification",
    example: NotificationChannel.EMAIL,
    required: true,
  })
  @IsEnum(NotificationChannel, {
    message: `Channel must be one of: ${Object.values(NotificationChannel).join(", ")}`,
  })
  @IsNotEmpty({ message: "Channel is required" })
  readonly channel: NotificationChannel;

  @ApiPropertyOptional({
    example: "Workflow moved to {{toState}}",
    description: "Email subject template with lightweight {{token}} interpolation (max 500 characters)",
    maxLength: 500,
  })
  @MaxLength(500, { message: "Subject template must not exceed 500 characters" })
  @IsString({ message: "Subject template must be a string" })
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly subjectTemplate?: string;

  @ApiProperty({
    example: "workflow-transition-completed",
    description: "Pug template file name/path under src/modules/notification/templates (1-5000 characters)",
    minLength: 1,
    maxLength: 5000,
    required: true,
  })
  @MaxLength(5000, { message: "Body template must not exceed 5000 characters" })
  @MinLength(1, { message: "Body template must be at least 1 character long" })
  @IsString({ message: "Body template must be a string" })
  @IsNotEmpty({ message: "Body template is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly bodyTemplate: string;

  @ApiPropertyOptional({
    description: "Whether this notification template is active",
    example: true,
  })
  @IsBoolean({ message: "isActive must be a boolean" })
  @IsOptional()
  readonly isActive?: boolean;
}
