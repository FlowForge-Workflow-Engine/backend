import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { CacheKeys } from "../../../infra/cache-keys";
import { RedisService } from "../../../infra/redis.service";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { TEST_IDS } from "@app/shared/test-utils";
import { WebhookConfigController } from "./webhook-config.controller";
import { WebhookConfigRepository } from "../repositories/webhook-config.repository";

describe("WebhookConfigController", () => {
  let controller: WebhookConfigController;
  let redis: ReturnType<typeof createMockRedisService>;
  let webhookConfigRepository: {
    insert: jest.MockedFunction<WebhookConfigRepository["insert"]>;
    findAllByTenant: jest.MockedFunction<WebhookConfigRepository["findAllByTenant"]>;
    findById: jest.MockedFunction<WebhookConfigRepository["findById"]>;
    update: jest.MockedFunction<WebhookConfigRepository["update"]>;
    remove: jest.MockedFunction<WebhookConfigRepository["remove"]>;
  };

  beforeEach(async () => {
    redis = createMockRedisService();
    webhookConfigRepository = {
      insert: jest.fn(),
      findAllByTenant: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookConfigController],
      providers: [
        { provide: WebhookConfigRepository, useValue: webhookConfigRepository },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    controller = module.get<WebhookConfigController>(WebhookConfigController);
  });

  it("findOne throws NotFoundException when config missing", async () => {
    webhookConfigRepository.findById.mockResolvedValue(null);
    await expect(controller.findOne({ id: "missing" }, TEST_IDS.TENANT_A_ID)).rejects.toThrow(
      new NotFoundException(AppErrors.WEBHOOK_CONFIG_NOT_FOUND)
    );
  });

  it("update invalidates webhook cache", async () => {
    webhookConfigRepository.update.mockResolvedValue({
      id: "cfg-1",
      name: "workflow.instance.created",
    } as never);

    const result = await controller.update(
      { id: "cfg-1" },
      TEST_IDS.TENANT_A_ID,
      { url: "https://new.example.com" }
    );
    expect(result.status).toBe("success");
    expect(redis.del).toHaveBeenCalledWith(
      CacheKeys.notifWebhooks(TEST_IDS.TENANT_A_ID, "workflow.instance.created")
    );
  });

  it("remove deletes and invalidates webhook cache", async () => {
    webhookConfigRepository.findById.mockResolvedValue({
      id: "cfg-2",
      name: "workflow.transition.completed",
    } as never);
    webhookConfigRepository.remove.mockResolvedValue(undefined);

    await controller.remove({ id: "cfg-2" }, TEST_IDS.TENANT_A_ID);
    expect(webhookConfigRepository.remove).toHaveBeenCalledWith("cfg-2", TEST_IDS.TENANT_A_ID);
    expect(redis.del).toHaveBeenCalledWith(
      CacheKeys.notifWebhooks(TEST_IDS.TENANT_A_ID, "workflow.transition.completed")
    );
  });
});

