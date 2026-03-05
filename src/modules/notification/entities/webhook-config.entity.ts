import { Column, Entity } from "typeorm";
import { BaseEntity } from "@app/shared/entities/base.entity";

@Entity("webhook_configs")
export class WebhookConfig extends BaseEntity {
  /** Human-readable name for the webhook configuration - helps identify webhook purpose */
  @Column({ type: "varchar", length: 100 })
  name: string;

  /** Target URL for HTTP POST delivery - destination endpoint for webhook payloads */
  @Column({ type: "text" })
  url: string;

  /** HMAC-SHA256 signing secret — never expose in API responses - secures webhook authenticity */
  @Column({ type: "varchar", length: 255 })
  secret: string;

  /** Array of NATS event names this webhook subscribes to - defines which events trigger this webhook */
  @Column({ type: "varchar", array: true, name: "event_triggers" })
  eventTriggers: string[];

  /** Flag to enable/disable webhook delivery - allows temporary disabling without deletion */
  @Column({ type: "boolean", name: "is_active", default: true })
  isActive: boolean;
}
