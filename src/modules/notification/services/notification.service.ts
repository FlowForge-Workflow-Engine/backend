import { MailerService } from "@nestjs-modules/mailer";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationTemplate } from "../entities/notification-template.entity";
import { NotificationLogRepository } from "../repositories/notification-log.repository";
import { NotificationStatus } from "../entities/notification-log.entity";

/**
 * Service for sending email notifications.
 * Renders Pug templates through Nest MailerModule, sends emails via SMTP,
 * and logs all notification attempts with their delivery status.
 * Integrates with NotificationSubscriber to handle workflow events.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationLogRepository: NotificationLogRepository,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService
  ) {}

  /**
   * Sends an email notification using a template.
   * Renders the configured Pug body template, sends via SMTP, and logs the attempt.
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
      const subject = this.renderSubject(template.subjectTemplate, context);

      await this.mailerService.sendMail({
        from: this.resolveFromAddress(),
        to: recipientEmail,
        subject,
        // Reuse the persisted bodyTemplate field as the Pug template name/path for this notification.
        template: this.normalizeTemplateName(template.bodyTemplate),
        context,
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

  /**
   * Purpose: resolve the sender address from the email-specific env names first, then the SMTP fallbacks.
   */
  private resolveFromAddress(): string {
    return (
      this.configService.get<string>("EMAIL_FROM") ??
      this.configService.get<string>("SMTP_FROM", "noreply@workflow-engine.com")
    );
  }

  /**
   * Purpose: render the persisted subject template while keeping Pug exclusively responsible for the email body.
   * Supports lightweight {{path.to.value}} interpolation for subjects without introducing a second body engine.
   */
  private renderSubject(
    subjectTemplate: string | null | undefined,
    context: Record<string, unknown>
  ): string {
    const source = subjectTemplate?.trim() || "Workflow notification";

    return source.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, token: string) => {
      const value = this.readContextPath(context, token);
      return value == null ? "" : String(value);
    });
  }

  /**
   * Purpose: normalize stored template names so API callers can send either "name" or "name.pug".
   */
  private normalizeTemplateName(templateName: string): string {
    return templateName.replace(/\.pug$/i, "").trim();
  }

  /**
   * Purpose: support dot-path lookups for subject interpolation tokens such as {{instancePayload.requestId}}.
   */
  private readContextPath(context: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>((current, segment) => {
      if (!current || typeof current !== "object" || !(segment in (current as Record<string, unknown>))) {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, context);
  }
}
