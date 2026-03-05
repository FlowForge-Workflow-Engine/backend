import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Immutable log of each webhook delivery attempt.
 * No updatedAt — a new row is inserted for every retry attempt.
 */
@Entity("webhook_delivery_logs")
@Index(["tenantId"])
export class WebhookDeliveryLog {
  /** Primary key - unique identifier for each webhook delivery attempt */
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** Tenant isolation - ensures webhook logs are scoped to specific tenant */
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId: string;

  /** Foreign key to webhook configuration - links delivery to specific webhook endpoint */
  @Column({ type: "uuid", name: "webhook_config_id" })
  webhookConfigId: string;

  /** NATS event name that triggered this webhook - categorizes webhook deliveries */
  @Column({ type: "varchar", length: 100, name: "event_name" })
  eventName: string;

  /** Full JSON payload sent to the endpoint - preserves exact data for debugging */
  @Column({ type: "jsonb", name: "payload" })
  payload: Record<string, unknown>;

  /** HTTP response status code from webhook endpoint - indicates delivery success/failure */
  @Column({ type: "integer", name: "http_status", nullable: true, default: null })
  httpStatus: number | null;

  /** Response body from webhook endpoint - captures error details for troubleshooting */
  @Column({ type: "text", name: "response_body", nullable: true, default: null })
  responseBody: string | null;

  /** Retry attempt number - tracks delivery retry logic for failed webhooks */
  @Column({ type: "integer", name: "attempt_number", default: 1 })
  attemptNumber: number;

  /** Timestamp when webhook was successfully delivered - null if still pending/failed */
  @Column({ type: "timestamptz", name: "delivered_at", nullable: true, default: null })
  deliveredAt: Date | null;

  /** Timestamp when delivery attempt was initiated - tracks delivery timing */
  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
}
