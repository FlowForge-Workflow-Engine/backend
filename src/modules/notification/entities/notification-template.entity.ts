import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@app/shared/entities/base.entity';

export enum NotificationChannel {
  EMAIL = 'email',
  WEBHOOK = 'webhook',
}

@Entity('notification_templates')
export class NotificationTemplate extends BaseEntity {
  /** The NATS event name that triggers this notification (e.g. "workflow-execution.transition.completed") */
  @Column({ type: 'varchar', length: 100, name: 'event_trigger' })
  eventTrigger: string;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    name: 'channel',
  })
  channel: NotificationChannel;

  /** Handlebars template for email subject — null for webhook channel */
  @Column({ type: 'text', name: 'subject_template', nullable: true, default: null })
  subjectTemplate: string | null;

  /** Handlebars template for email body or webhook payload JSON */
  @Column({ type: 'text', name: 'body_template' })
  bodyTemplate: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;
}

