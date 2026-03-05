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
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", name: "tenant_id" })
  tenantId: string;

  @Column({ type: "uuid", name: "template_id" })
  templateId: string;

  @Column({ type: "uuid", name: "recipient_user_id", nullable: true, default: null })
  recipientUserId: string | null;

  /** Snapshot of recipient email at send-time */
  @Column({ type: "varchar", length: 255, name: "recipient_email" })
  recipientEmail: string;

  @Column({
    type: "enum",
    enum: NotificationChannel,
    name: "channel",
  })
  channel: NotificationChannel;

  @Column({
    type: "enum",
    enum: NotificationStatus,
    name: "status",
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  @Column({ type: "integer", name: "retry_count", default: 0 })
  retryCount: number;

  @Column({ type: "text", name: "error_message", nullable: true, default: null })
  errorMessage: string | null;

  @Column({ type: "timestamptz", name: "sent_at", nullable: true, default: null })
  sentAt: Date | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
}
