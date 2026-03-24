import { CacheKeys } from "../../../infra/cache-keys";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { TEST_IDS } from "@app/shared/test-utils";
import { NotificationTemplateBootstrapService } from "./notification-template-bootstrap.service";
import { NotificationTemplateRepository } from "../repositories/notification-template.repository";
import { NotificationChannel } from "../entities/notification-template.entity";
import { NotificationEventTrigger } from "../constants/notification-event-trigger.enum";
import { RedisService } from "../../../infra/redis.service";

describe("NotificationTemplateBootstrapService", () => {
  let service: NotificationTemplateBootstrapService;
  let redis: ReturnType<typeof createMockRedisService>;
  let templateRepository: {
    findFirstByEventTriggerAndChannel: jest.MockedFunction<
      NotificationTemplateRepository["findFirstByEventTriggerAndChannel"]
    >;
    insert: jest.MockedFunction<NotificationTemplateRepository["insert"]>;
  };

  beforeEach(() => {
    redis = createMockRedisService();
    templateRepository = {
      findFirstByEventTriggerAndChannel: jest.fn(),
      insert: jest.fn(),
    };
    service = new NotificationTemplateBootstrapService(
      templateRepository as unknown as NotificationTemplateRepository,
      redis as unknown as RedisService
    );
  });

  it("does nothing when template already exists", async () => {
    templateRepository.findFirstByEventTriggerAndChannel.mockResolvedValue({ id: "tpl-1" } as never);

    await service.ensureTenantCreatedWelcomeTemplate(TEST_IDS.TENANT_A_ID);

    expect(templateRepository.insert).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("inserts default template and invalidates cache when missing", async () => {
    templateRepository.findFirstByEventTriggerAndChannel.mockResolvedValue(null);
    templateRepository.insert.mockResolvedValue({ id: "tpl-2" } as never);

    await service.ensureTenantCreatedWelcomeTemplate(TEST_IDS.TENANT_A_ID);

    expect(templateRepository.findFirstByEventTriggerAndChannel).toHaveBeenCalledWith(
      NotificationEventTrigger.TENANT_CREATED,
      NotificationChannel.EMAIL,
      TEST_IDS.TENANT_A_ID
    );
    expect(templateRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TEST_IDS.TENANT_A_ID,
        eventTrigger: NotificationEventTrigger.TENANT_CREATED,
        channel: NotificationChannel.EMAIL,
      })
    );
    expect(redis.del).toHaveBeenCalledWith(
      CacheKeys.notifTemplates(TEST_IDS.TENANT_A_ID, NotificationEventTrigger.TENANT_CREATED)
    );
  });
});

