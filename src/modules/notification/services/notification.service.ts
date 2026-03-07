import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import * as Handlebars from "handlebars";
import { NotificationTemplate } from "../entities/notification-template.entity";
import { NotificationLogRepository } from "../repositories/notification-log.repository";
import { NotificationStatus } from "../entities/notification-log.entity";

/**
 * Service for sending email notifications.
 * Renders Handlebars templates with context data, sends emails via SMTP/SES,
 * and logs all notification attempts with their delivery status.
 * Integrates with NotificationSubscriber to handle workflow events.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly notificationLogRepository: NotificationLogRepository,
    private readonly configService: ConfigService
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>("SMTP_HOST", "smtp.mailhog.local"),
      port: this.configService.get<number>("SMTP_PORT", 1025),
      secure: this.configService.get<boolean>("SMTP_SECURE", false),
      auth: this.configService.get<string>("SMTP_USER")
        ? {
            user: this.configService.get<string>("SMTP_USER"),
            pass: this.configService.get<string>("SMTP_PASS"),
          }
        : undefined,
    });
  }

  /**
   * Sends an email notification using a template.
   * Renders Handlebars template with provided context, sends via SMTP, and logs the attempt.
   * Creates a notification log entry before sending and updates status after completion.
   * Purpose: keep subscriber-triggered notification log writes tenant-safe by re-entering DB context per write.
   * Gracefully handles failures by logging them without throwing.
   *
   * @param template - The notification template containing subject and body templates
   * @param recipientEmail - The email address to send to
   * @param recipientUserId - The user ID of the recipient (optional, for audit trail)
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param context - Object containing variables for Handlebars template rendering
   * @returns Promise<void>
   */
  async sendEmail(
    template: NotificationTemplate,
    recipientEmail: string,
    recipientUserId: string | null,
    tenantId: string,
    context: Record<string, unknown>
  ): Promise<void> {
    // Create the initial log row under a tenant-scoped DB transaction before external I/O begins.
    const log = await this.notificationLogRepository.insert({
      tenantId,
      templateId: template.id,
      recipientUserId,
      recipientEmail,
      channel: template.channel,
      status: NotificationStatus.PENDING,
    });

    try {
      const subjectFn = Handlebars.compile(template.subjectTemplate ?? "");
      const bodyFn = Handlebars.compile(template.bodyTemplate);

      await this.transporter.sendMail({
        from: this.configService.get<string>("SMTP_FROM", "noreply@workflow-engine.local"),
        to: recipientEmail,
        subject: subjectFn(context),
        html: bodyFn(context),
      });

      // Re-enter tenant DB context for the status update because this runs after the SMTP call.
      await this.notificationLogRepository.updateStatus(
        log.id,
        tenantId,
        NotificationStatus.SENT,
        new Date()
      );
      this.logger.log(`Email sent to ${recipientEmail} [logId=${log.id}]`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.notificationLogRepository.updateStatus(
        log.id,
        tenantId,
        NotificationStatus.FAILED,
        undefined,
        message
      );
      this.logger.error(`Email failed to ${recipientEmail} [logId=${log.id}]: ${message}`);
    }
  }
}
