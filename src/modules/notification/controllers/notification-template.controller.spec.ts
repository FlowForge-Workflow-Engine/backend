import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { CacheKeys } from "../../../infra/cache-keys";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { TEST_IDS } from "@app/shared/test-utils";
import { NotificationTemplateController } from "./notification-template.controller";
import { NotificationTemplateRepository } from "../repositories/notification-template.repository";
import { RedisService } from "../../../infra/redis.service";
import { NotificationEventTrigger } from "../constants/notification-event-trigger.enum";
import { NotificationChannel } from "../entities/notification-template.entity";

describe("NotificationTemplateController", () => {
  let controller: NotificationTemplateController;
  let redis: ReturnType<typeof createMockRedisService>;
  let templateRepository: {
    insert: jest.MockedFunction<NotificationTemplateRepository["insert"]>;
    findAllByTenant: jest.MockedFunction<NotificationTemplateRepository["findAllByTenant"]>;
    findById: jest.MockedFunction<NotificationTemplateRepository["findById"]>;
    update: jest.MockedFunction<NotificationTemplateRepository["update"]>;
    remove: jest.MockedFunction<NotificationTemplateRepository["remove"]>;
  };

  beforeEach(async () => {
    redis = createMockRedisService();
    templateRepository = {
      insert: jest.fn(),
      findAllByTenant: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationTemplateController],
      providers: [
        { provide: NotificationTemplateRepository, useValue: templateRepository },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    controller = module.get<NotificationTemplateController>(NotificationTemplateController);
  });

  it("create inserts template and wraps response", async () => {
    templateRepository.insert.mockResolvedValue({ id: "tpl-1" } as never);
    const result = await controller.create(
      {
        eventTrigger: NotificationEventTrigger.WORKFLOW_INSTANCE_CREATED,
        channel: NotificationChannel.EMAIL,
        subjectTemplate: "subj",
        bodyTemplate: "tpl",
        isActive: true,
      },
      TEST_IDS.TENANT_A_ID
    );
    expect(result.status).toBe("success");
    expect(templateRepository.insert).toHaveBeenCalled();
  });

  it("findOne throws NotFoundException when missing", async () => {
    templateRepository.findById.mockResolvedValue(null);
    await expect(controller.findOne({ id: "missing" }, TEST_IDS.TENANT_A_ID)).rejects.toThrow(
      new NotFoundException(AppErrors.NOTIFICATION_TEMPLATE_NOT_FOUND)
    );
  });

  it("remove deletes and invalidates cache", async () => {
    templateRepository.findById.mockResolvedValue({
      id: "tpl-2",
      eventTrigger: NotificationEventTrigger.WORKFLOW_INSTANCE_CREATED,
    } as never);
    templateRepository.remove.mockResolvedValue(undefined);

    await controller.remove({ id: "tpl-2" }, TEST_IDS.TENANT_A_ID);
    expect(templateRepository.remove).toHaveBeenCalledWith("tpl-2", TEST_IDS.TENANT_A_ID);
    expect(redis.del).toHaveBeenCalledWith(
      CacheKeys.notifTemplates(
        TEST_IDS.TENANT_A_ID,
        NotificationEventTrigger.WORKFLOW_INSTANCE_CREATED
      )
    );
  });
});

