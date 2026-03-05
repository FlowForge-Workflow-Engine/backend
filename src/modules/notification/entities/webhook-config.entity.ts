import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@app/shared/entities/base.entity';

@Entity('webhook_configs')
export class WebhookConfig extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Target URL for HTTP POST delivery */
  @Column({ type: 'text' })
  url: string;

  /** HMAC-SHA256 signing secret — never expose in API responses */
  @Column({ type: 'varchar', length: 255 })
  secret: string;

  /** Array of NATS event names this webhook subscribes to */
  @Column({ type: 'varchar', array: true, name: 'event_triggers' })
  eventTriggers: string[];

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;
}

