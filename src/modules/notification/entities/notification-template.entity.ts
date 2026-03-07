import { Column, Entity } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";
import { NotificationEventTrigger } from "../constants/notification-event-trigger.enum";

export enum NotificationChannel {
  EMAIL = "email",
  WEBHOOK = "webhook",
}

@Entity("notification_templates")
export class NotificationTemplate extends BaseEntity {
  /** Supported workflow event that triggers this notification - kept selective so template creation matches current subscriber coverage. */
  @Column({ type: "varchar", length: 100, name: "event_trigger" })
  eventTrigger: NotificationEventTrigger;

  /** Delivery channel for the notification - determines how notification is sent */
  @Column({
    type: "enum",
    enum: NotificationChannel,
    name: "channel",
  })
  channel: NotificationChannel;

  /** Subject text template for email notifications — supports lightweight {{token}} interpolation and is null for webhook channel. */
  @Column({ type: "text", name: "subject_template", nullable: true, default: null })
  subjectTemplate: string | null;

  /** Pug template name/path for email body rendering or raw payload template content for webhook channel. */
  @Column({ type: "text", name: "body_template" })
  bodyTemplate: string;

  /** Flag to enable/disable this notification template - allows temporary disabling */
  @Column({ type: "boolean", name: "is_active", default: true })
  isActive: boolean;
}
