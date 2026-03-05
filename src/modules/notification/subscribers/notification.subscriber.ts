import { Controller, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { NatsEvents } from "@app/shared/constants/nats-events.enum";
import {
  IWorkflowInstanceCreatedEvent,
  IWorkflowTransitionCompletedEvent,
  IWorkflowInstanceCompletedEvent,
  IWorkflowInstanceCancelledEvent,
} from "@app/shared/interfaces/events/workflow-events.interface";
import { NotificationTemplateRepository } from "../repositories/notification-template.repository";
import { WebhookConfigRepository } from "../repositories/webhook-config.repository";
import { NotificationService } from "../services/notification.service";
import { WebhookService } from "../services/webhook.service";
import { NotificationChannel } from "../entities/notification-template.entity";

@Controller()
export class NotificationSubscriber {
  private readonly logger = new Logger(NotificationSubscriber.name);

  constructor(
    private readonly templateRepository: NotificationTemplateRepository,
    private readonly webhookConfigRepository: WebhookConfigRepository,
    private readonly notificationService: NotificationService,
    private readonly webhookService: WebhookService
  ) {}

  @MessagePattern(NatsEvents.WORKFLOW_INSTANCE_CREATED)
  async onInstanceCreated(@Payload() data: IWorkflowInstanceCreatedEvent): Promise<void> {
    await this.dispatch(NatsEvents.WORKFLOW_INSTANCE_CREATED, data.tenantId, { ...data } as Record<
      string,
      unknown
    >);
  }

  @MessagePattern(NatsEvents.WORKFLOW_TRANSITION_COMPLETED)
  async onTransitionCompleted(@Payload() data: IWorkflowTransitionCompletedEvent): Promise<void> {
    await this.dispatch(NatsEvents.WORKFLOW_TRANSITION_COMPLETED, data.tenantId, { ...data } as Record<
      string,
      unknown
    >);
  }

  @MessagePattern(NatsEvents.WORKFLOW_INSTANCE_COMPLETED)
  async onInstanceCompleted(@Payload() data: IWorkflowInstanceCompletedEvent): Promise<void> {
    await this.dispatch(NatsEvents.WORKFLOW_INSTANCE_COMPLETED, data.tenantId, { ...data } as Record<
      string,
      unknown
    >);
  }

  @MessagePattern(NatsEvents.WORKFLOW_INSTANCE_CANCELLED)
  async onInstanceCancelled(@Payload() data: IWorkflowInstanceCancelledEvent): Promise<void> {
    await this.dispatch(NatsEvents.WORKFLOW_INSTANCE_CANCELLED, data.tenantId, { ...data } as Record<
      string,
      unknown
    >);
  }

  /**
   * Finds all active templates and webhook configs for the given event,
   * then dispatches notifications in parallel (fire-and-forget per handler).
   */
  private async dispatch(
    eventName: string,
    tenantId: string,
    context: Record<string, unknown>
  ): Promise<void> {
    try {
      const [templates, webhooks] = await Promise.all([
        this.templateRepository.findActiveByEventTrigger(eventName, tenantId),
        this.webhookConfigRepository.findActiveByEventName(eventName, tenantId),
      ]);

      const emailTemplates = templates.filter((t) => t.channel === NotificationChannel.EMAIL);
      const webhookTemplates = templates.filter((t) => t.channel === NotificationChannel.WEBHOOK);

      // Email notifications — recipient email extracted from context best-effort
      const recipientEmail = (context["performedByEmail"] as string | undefined) ?? "";

      for (const template of emailTemplates) {
        if (!recipientEmail) {
          this.logger.warn(`Skipping email template [id=${template.id}] — no recipientEmail in context`);
          continue;
        }
        this.notificationService
          .sendEmail(template, recipientEmail, null, tenantId, context)
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
}
