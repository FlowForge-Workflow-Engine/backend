import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Immutable log of each webhook delivery attempt.
 * No updatedAt — a new row is inserted for every retry attempt.
 */
@Entity('webhook_delivery_logs')
@Index(['tenantId'])
export class WebhookDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'webhook_config_id' })
  webhookConfigId: string;

  @Column({ type: 'varchar', length: 100, name: 'event_name' })
  eventName: string;

  /** Full JSON payload sent to the endpoint */
  @Column({ type: 'jsonb', name: 'payload' })
  payload: Record<string, unknown>;

  @Column({ type: 'integer', name: 'http_status', nullable: true, default: null })
  httpStatus: number | null;

  @Column({ type: 'text', name: 'response_body', nullable: true, default: null })
  responseBody: string | null;

  @Column({ type: 'integer', name: 'attempt_number', default: 1 })
  attemptNumber: number;

  @Column({ type: 'timestamptz', name: 'delivered_at', nullable: true, default: null })
  deliveredAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

