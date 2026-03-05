import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { NotificationChannel } from "./notification-template.entity";

export enum NotificationStatus {
  PENDING = "pending",
  SENT = "sent",
  FAILED = "failed",
}

/**
 * Append-only log of every notification delivery attempt.
 * Does NOT have updatedAt — status is recorded via a new column update only
 * through the repository helper (updateStatus), not replaced row-by-row.
 */
@Entity("notification_logs")
@Index(["tenantId"])
export class NotificationLog {
  /** Primary key - unique identifier for each notification delivery attempt */
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** Tenant isolation - ensures notification logs are scoped to specific tenant */
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId: string;

  /** Foreign key to notification template - links log to specific template used */
  @Column({ type: "uuid", name: "template_id" })
  templateId: string;

  /** Foreign key to recipient user - null for external recipients not in system */
  @Column({ type: "uuid", name: "recipient_user_id", nullable: true, default: null })
  recipientUserId: string | null;

  /** Snapshot of recipient email at send-time - preserves delivery target even if user email changes */
  @Column({ type: "varchar", length: 255, name: "recipient_email" })
  recipientEmail: string;

  /** Delivery channel used for this notification - tracks how notification was sent */
  @Column({
    type: "enum",
    enum: NotificationChannel,
    name: "channel",
  })
  channel: NotificationChannel;

  /** Current status of notification delivery - tracks delivery lifecycle */
  @Column({
    type: "enum",
    enum: NotificationStatus,
    name: "status",
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  /** Number of delivery retry attempts - tracks retry logic for failed notifications */
  @Column({ type: "integer", name: "retry_count", default: 0 })
  retryCount: number;

  /** Error message from failed delivery attempts - helps with troubleshooting */
  @Column({ type: "text", name: "error_message", nullable: true, default: null })
  errorMessage: string | null;

  /** Timestamp when notification was successfully sent - null if still pending/failed */
  @Column({ type: "timestamptz", name: "sent_at", nullable: true, default: null })
  sentAt: Date | null;

  /** Timestamp when notification log was created - tracks when delivery was initiated */
  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
}
