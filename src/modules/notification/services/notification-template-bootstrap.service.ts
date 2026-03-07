import { Injectable } from "@nestjs/common";
import { INotificationTemplateBootstrapContract } from "@app/shared/interfaces/contracts/notification-template-bootstrap.contract";
import { CacheKeys } from "../../../infra/cache-keys";
import { RedisService } from "../../../infra/redis.service";
import { NotificationEventTrigger } from "../constants/notification-event-trigger.enum";
import { NotificationChannel } from "../entities/notification-template.entity";
import { NotificationTemplateRepository } from "../repositories/notification-template.repository";

const DEFAULT_TENANT_CREATED_SUBJECT_TEMPLATE = "Welcome to {{name}} — Protect your Tenant UUID";
const DEFAULT_TENANT_CREATED_BODY_TEMPLATE = "tenant-created-welcome";

@Injectable()
export class NotificationTemplateBootstrapService implements INotificationTemplateBootstrapContract {
  constructor(
    private readonly templateRepository: NotificationTemplateRepository,
    private readonly redis: RedisService
  ) {}

  /**
   * Seed the tenant-scoped welcome email template before onboarding publishes tenant.created.
   * This guarantees the very first tenant-created event can be resolved by NotificationSubscriber.
   */
  async ensureTenantCreatedWelcomeTemplate(tenantId: string): Promise<void> {
    const existing = await this.templateRepository.findFirstByEventTriggerAndChannel(
      NotificationEventTrigger.TENANT_CREATED,
      NotificationChannel.EMAIL,
      tenantId
    );

    // Preserve any tenant-specific customization if a template already exists.
    if (existing) return;

    await this.templateRepository.insert({
      tenantId,
      eventTrigger: NotificationEventTrigger.TENANT_CREATED,
      channel: NotificationChannel.EMAIL,
      subjectTemplate: DEFAULT_TENANT_CREATED_SUBJECT_TEMPLATE,
      bodyTemplate: DEFAULT_TENANT_CREATED_BODY_TEMPLATE,
      isActive: true,
    });

    // Clear the event-template cache so an immediate post-bootstrap publish always sees the fresh row.
    await this.redis.del(CacheKeys.notifTemplates(tenantId, NotificationEventTrigger.TENANT_CREATED));
  }
}
