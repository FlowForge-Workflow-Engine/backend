import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as Handlebars from 'handlebars';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { NotificationLogRepository } from '../repositories/notification-log.repository';
import { NotificationStatus } from '../entities/notification-log.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly notificationLogRepository: NotificationLogRepository,
    private readonly configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'smtp.mailhog.local'),
      port: this.configService.get<number>('SMTP_PORT', 1025),
      secure: this.configService.get<boolean>('SMTP_SECURE', false),
      auth: this.configService.get<string>('SMTP_USER')
        ? {
            user: this.configService.get<string>('SMTP_USER'),
            pass: this.configService.get<string>('SMTP_PASS'),
          }
        : undefined,
    });
  }

  /**
   * Renders a Handlebars template, sends the email via SMTP/SES, and writes
   * a notification_log entry with the resulting status.
   */
  async sendEmail(
    template: NotificationTemplate,
    recipientEmail: string,
    recipientUserId: string | null,
    tenantId: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const log = await this.notificationLogRepository.insert({
      tenantId,
      templateId: template.id,
      recipientUserId,
      recipientEmail,
      channel: template.channel,
      status: NotificationStatus.PENDING,
    });

    try {
      const subjectFn = Handlebars.compile(template.subjectTemplate ?? '');
      const bodyFn = Handlebars.compile(template.bodyTemplate);

      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM', 'noreply@workflow-engine.local'),
        to: recipientEmail,
        subject: subjectFn(context),
        html: bodyFn(context),
      });

      await this.notificationLogRepository.updateStatus(log.id, NotificationStatus.SENT, new Date());
      this.logger.log(`Email sent to ${recipientEmail} [logId=${log.id}]`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.notificationLogRepository.updateStatus(
        log.id,
        NotificationStatus.FAILED,
        undefined,
        message,
      );
      this.logger.error(`Email failed to ${recipientEmail} [logId=${log.id}]: ${message}`);
    }
  }
}

