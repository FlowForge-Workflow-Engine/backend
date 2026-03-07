import { Controller, Logger } from "@nestjs/common";
import { EventPattern, Payload } from "@nestjs/microservices";
import {
  IWorkflowInstanceCreatedEvent,
  IWorkflowTransitionCompletedEvent,
  IWorkflowInstanceCompletedEvent,
  IWorkflowInstanceCancelledEvent,
} from "@app/shared/interfaces/events/workflow-events.interface";
import { ITenantCreatedEvent } from "@app/shared/interfaces/events/tenant-events.interface";
import { NotificationTemplateRepository } from "../repositories/notification-template.repository";
import { WebhookConfigRepository } from "../repositories/webhook-config.repository";
import { NotificationService } from "../services/notification.service";
import { WebhookService } from "../services/webhook.service";
import { NotificationChannel, NotificationTemplate } from "../entities/notification-template.entity";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";
import { WebhookConfig } from "../entities/webhook-config.entity";
import { NotificationEventTrigger } from "../constants/notification-event-trigger.enum";

@Controller()
export class NotificationSubscriber {
  private readonly logger = new Logger(NotificationSubscriber.name);

  constructor(
    private readonly templateRepository: NotificationTemplateRepository,
    private readonly webhookConfigRepository: WebhookConfigRepository,
    private readonly notificationService: NotificationService,
    private readonly webhookService: WebhookService,
    private readonly redis: RedisService
  ) {}

  @EventPattern(NotificationEventTrigger.TENANT_CREATED)
  async onTenantCreated(@Payload() data: ITenantCreatedEvent): Promise<void> {
    // The onboarding flow enriches tenant.created with founding-admin delivery fields so this welcome email
    // remains fully event-driven and notification stays decoupled from auth internals.
    await this.dispatch(NotificationEventTrigger.TENANT_CREATED, data.tenantId, {
      ...data,
    } as Record<string, unknown>);
  }

  @EventPattern(NotificationEventTrigger.WORKFLOW_INSTANCE_CREATED)
  async onInstanceCreated(@Payload() data: IWorkflowInstanceCreatedEvent): Promise<void> {
    await this.dispatch(NotificationEventTrigger.WORKFLOW_INSTANCE_CREATED, data.tenantId, {
      ...data,
    } as Record<string, unknown>);
  }

  @EventPattern(NotificationEventTrigger.WORKFLOW_TRANSITION_COMPLETED)
  async onTransitionCompleted(@Payload() data: IWorkflowTransitionCompletedEvent): Promise<void> {
    await this.dispatch(NotificationEventTrigger.WORKFLOW_TRANSITION_COMPLETED, data.tenantId, {
      ...data,
    } as Record<string, unknown>);
  }

  @EventPattern(NotificationEventTrigger.WORKFLOW_INSTANCE_COMPLETED)
  async onInstanceCompleted(@Payload() data: IWorkflowInstanceCompletedEvent): Promise<void> {
    await this.dispatch(NotificationEventTrigger.WORKFLOW_INSTANCE_COMPLETED, data.tenantId, {
      ...data,
    } as Record<string, unknown>);
  }

  @EventPattern(NotificationEventTrigger.WORKFLOW_INSTANCE_CANCELLED)
  async onInstanceCancelled(@Payload() data: IWorkflowInstanceCancelledEvent): Promise<void> {
    await this.dispatch(NotificationEventTrigger.WORKFLOW_INSTANCE_CANCELLED, data.tenantId, {
      ...data,
    } as Record<string, unknown>);
  }

  /**
   * Cache-aside lookup: retrieve templates for an event trigger.
   * TTL is MEDIUM since templates change infrequently but we want reasonably fresh data.
   */
  private async getTemplatesForEvent(
    eventName: NotificationEventTrigger,
    tenantId: string
  ): Promise<NotificationTemplate[]> {
    const cacheKey = CacheKeys.notifTemplates(tenantId, eventName);
    const cached = await this.redis.get<NotificationTemplate[]>(cacheKey);
    if (cached) return cached;

    const templates = await this.templateRepository.findActiveByEventTrigger(eventName, tenantId);
    await this.redis.set(cacheKey, templates, CacheTTL.MEDIUM);
    return templates;
  }

  /**
   * Cache-aside lookup: retrieve webhook configs for an event name.
   * TTL is MEDIUM since webhook configs change infrequently.
   */
  private async getActiveWebhooks(
    eventName: NotificationEventTrigger,
    tenantId: string
  ): Promise<WebhookConfig[]> {
    const cacheKey = CacheKeys.notifWebhooks(tenantId, eventName);
    const cached = await this.redis.get<WebhookConfig[]>(cacheKey);
    if (cached) return cached;

    const webhooks = await this.webhookConfigRepository.findActiveByEventName(eventName, tenantId);
    await this.redis.set(cacheKey, webhooks, CacheTTL.MEDIUM);
    return webhooks;
  }

  /**
   * Finds all active templates and webhook configs for the given event,
   * then dispatches notifications in parallel (fire-and-forget per handler).
   */
  private async dispatch(
    eventName: NotificationEventTrigger,
    tenantId: string,
    context: Record<string, unknown>
  ): Promise<void> {
    try {
      const [templates, webhooks] = await Promise.all([
        this.getTemplatesForEvent(eventName, tenantId),
        this.getActiveWebhooks(eventName, tenantId),
      ]);

      const emailTemplates = templates.filter((t) => t.channel === NotificationChannel.EMAIL);
      const webhookTemplates = templates.filter((t) => t.channel === NotificationChannel.WEBHOOK);

      // Email notifications — resolve the best available recipient details from the event payload.
      const recipientEmail = this.extractRecipientEmail(context);
      const recipientUserId = this.extractRecipientUserId(context);

      for (const template of emailTemplates) {
        if (!recipientEmail) {
          this.logger.warn(
            `Skipping email template [id=${template.id}] — no recipientEmail available for ${eventName}`
          );
          continue;
        }
        this.notificationService
          .sendEmail(template, recipientEmail, recipientUserId, tenantId, { ...context, eventName })
          .catch((err) => this.logger.error("sendEmail error", err));
      }

      // Webhook channel templates (body_template rendered as JSON payload)
      for (const template of webhookTemplates) {
        this.logger.debug(`Webhook template [id=${template.id}] mapped to event — no direct HTTP target`);
      }

      // Direct webhook config deliveries
      for (const webhook of webhooks) {
        this.webhookService
          .deliver(webhook, eventName, context)
          .catch((err) => this.logger.error("webhook deliver error", err));
      }
    } catch (err) {
      this.logger.error(`NotificationSubscriber.dispatch failed [event=${eventName}]`, err);
    }
  }

  /**
   * Purpose: resolve a recipient email from the event payload without coupling this module to upstream handler internals.
   */
  private extractRecipientEmail(context: Record<string, unknown>): string | null {
    const candidates = [
      context["adminEmail"],
      context["performedByEmail"],
      context["createdByEmail"],
      context["cancelledByEmail"],
      context["actorEmail"],
    ];

    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }

    return null;
  }

  /**
   * Purpose: capture the best available recipient user ID for notification log traceability when the event payload includes one.
   */
  private extractRecipientUserId(context: Record<string, unknown>): string | null {
    const candidates = [
      context["adminUserId"],
      context["performedByUserId"],
      context["createdByUserId"],
      context["cancelledByUserId"],
      context["actorId"],
    ];

    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }

    return null;
  }
}
