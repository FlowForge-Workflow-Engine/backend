import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { TEST_IDS } from "@app/shared/test-utils";
import { NotificationSubscriber } from "./notification.subscriber";
import { NotificationTemplateRepository } from "../repositories/notification-template.repository";
import { WebhookConfigRepository } from "../repositories/webhook-config.repository";
import { NotificationService } from "../services/notification.service";
import { WebhookService } from "../services/webhook.service";
import { NotificationChannel } from "../entities/notification-template.entity";
import { NotificationEventTrigger } from "../constants/notification-event-trigger.enum";
import { CacheTTL } from "../../../infra/cache-ttl";
import { CacheKeys } from "../../../infra/cache-keys";
import { RedisService } from "../../../infra/redis.service";

describe("NotificationSubscriber", () => {
  let subscriber: NotificationSubscriber;
  let redis: ReturnType<typeof createMockRedisService>;
  let templateRepository: {
    findActiveByEventTrigger: jest.MockedFunction<NotificationTemplateRepository["findActiveByEventTrigger"]>;
  };
  let webhookConfigRepository: {
    findActiveByEventName: jest.MockedFunction<WebhookConfigRepository["findActiveByEventName"]>;
  };
  let notificationService: { sendEmail: jest.MockedFunction<NotificationService["sendEmail"]> };
  let webhookService: { deliver: jest.MockedFunction<WebhookService["deliver"]> };

  beforeEach(() => {
    redis = createMockRedisService();
    templateRepository = {
      findActiveByEventTrigger: jest.fn(),
    };
    webhookConfigRepository = {
      findActiveByEventName: jest.fn(),
    };
    notificationService = { sendEmail: jest.fn() };
    webhookService = { deliver: jest.fn() };

    subscriber = new NotificationSubscriber(
      templateRepository as unknown as NotificationTemplateRepository,
      webhookConfigRepository as unknown as WebhookConfigRepository,
      notificationService as unknown as NotificationService,
      webhookService as unknown as WebhookService,
      redis as unknown as RedisService
    );
  });

  it("dispatches email and webhook on workflow transition event", async () => {
    redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    templateRepository.findActiveByEventTrigger.mockResolvedValue([
      {
        id: "tpl-1",
        channel: NotificationChannel.EMAIL,
        tenantId: TEST_IDS.TENANT_A_ID,
      } as never,
    ]);
    webhookConfigRepository.findActiveByEventName.mockResolvedValue([{ id: "wh-1" } as never]);
    redis.set.mockResolvedValue(undefined);
    notificationService.sendEmail.mockResolvedValue(undefined);
    webhookService.deliver.mockResolvedValue(undefined);

    await subscriber.onTransitionCompleted({
      eventId: "evt-1",
      tenantId: TEST_IDS.TENANT_A_ID,
      instanceId: TEST_IDS.INSTANCE_ID,
      workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
      fromState: "Applied",
      toState: "Under Review",
      transitionId: TEST_IDS.TRANSITION_ID,
      transitionName: "Submit for Review",
      performedByUserId: TEST_IDS.REQUESTOR_USER_ID,
      performedByEmail: "bob@acme.com",
      performedByRole: "Requestor",
      comment: "ok",
      instancePayload: { days: 10 },
      occurredAt: new Date().toISOString(),
    });

    expect(templateRepository.findActiveByEventTrigger).toHaveBeenCalledWith(
      NotificationEventTrigger.WORKFLOW_TRANSITION_COMPLETED,
      TEST_IDS.TENANT_A_ID
    );
    expect(webhookConfigRepository.findActiveByEventName).toHaveBeenCalledWith(
      NotificationEventTrigger.WORKFLOW_TRANSITION_COMPLETED,
      TEST_IDS.TENANT_A_ID
    );
    expect(redis.set).toHaveBeenCalledWith(
      CacheKeys.notifTemplates(TEST_IDS.TENANT_A_ID, NotificationEventTrigger.WORKFLOW_TRANSITION_COMPLETED),
      expect.any(Array),
      CacheTTL.MEDIUM
    );
    expect(notificationService.sendEmail).toHaveBeenCalledTimes(1);
    expect(webhookService.deliver).toHaveBeenCalledTimes(1);
  });

  it("uses cache hit and skips repository calls", async () => {
    redis.get
      .mockResolvedValueOnce([{ id: "tpl-cached", channel: NotificationChannel.EMAIL }])
      .mockResolvedValueOnce([{ id: "wh-cached" }]);
    notificationService.sendEmail.mockResolvedValue(undefined);
    webhookService.deliver.mockResolvedValue(undefined);

    await subscriber.onInstanceCreated({
      eventId: "evt-2",
      tenantId: TEST_IDS.TENANT_A_ID,
      instanceId: TEST_IDS.INSTANCE_ID,
      performedByUserId: TEST_IDS.REQUESTOR_USER_ID,
      performedByEmail: "bob@acme.com",
      performedByRole: "Requestor",
      workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
      initialState: "Applied",
      createdByUserId: TEST_IDS.REQUESTOR_USER_ID,
      occurredAt: new Date().toISOString(),
    });

    expect(templateRepository.findActiveByEventTrigger).not.toHaveBeenCalled();
    expect(webhookConfigRepository.findActiveByEventName).not.toHaveBeenCalled();
  });
});

