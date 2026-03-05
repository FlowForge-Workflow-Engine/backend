import { Column, Entity } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";

export enum NotificationChannel {
  EMAIL = "email",
  WEBHOOK = "webhook",
}

@Entity("notification_templates")
export class NotificationTemplate extends BaseEntity {
  /** The NATS event name that triggers this notification (e.g. "workflow-execution.transition.completed") - defines when notification fires */
  @Column({ type: "varchar", length: 100, name: "event_trigger" })
  eventTrigger: string;

  /** Delivery channel for the notification - determines how notification is sent */
  @Column({
    type: "enum",
    enum: NotificationChannel,
    name: "channel",
  })
  channel: NotificationChannel;

  /** Handlebars template for email subject — null for webhook channel - customizes email subject line */
  @Column({ type: "text", name: "subject_template", nullable: true, default: null })
  subjectTemplate: string | null;

  /** Handlebars template for email body or webhook payload JSON - defines notification content */
  @Column({ type: "text", name: "body_template" })
  bodyTemplate: string;

  /** Flag to enable/disable this notification template - allows temporary disabling */
  @Column({ type: "boolean", name: "is_active", default: true })
  isActive: boolean;
}
