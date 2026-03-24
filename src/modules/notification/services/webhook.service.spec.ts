import { WebhookService } from "./webhook.service";
import { WebhookDeliveryLogRepository } from "../repositories/webhook-delivery-log.repository";
import { WebhookConfig } from "../entities/webhook-config.entity";
import { TEST_IDS } from "@app/shared/test-utils";

describe("WebhookService", () => {
  let service: WebhookService;
  let webhookDeliveryLogRepository: {
    insert: jest.MockedFunction<WebhookDeliveryLogRepository["insert"]>;
  };

  beforeEach(() => {
    webhookDeliveryLogRepository = { insert: jest.fn() };
    service = new WebhookService(
      webhookDeliveryLogRepository as unknown as WebhookDeliveryLogRepository
    );
  });

  it("deliver logs successful 2xx response", async () => {
    const config = {
      id: TEST_IDS.WEBHOOK_CONFIG_ID,
      tenantId: TEST_IDS.TENANT_A_ID,
      name: "workflow.transition.completed",
      url: "https://example.com/webhook",
      secret: "abc",
      eventTriggers: ["workflow.transition.completed"],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as WebhookConfig;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue("ok"),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    webhookDeliveryLogRepository.insert.mockResolvedValue({} as never);

    await service.deliver(config, "workflow.transition.completed", { x: 1 }, 2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(webhookDeliveryLogRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TEST_IDS.TENANT_A_ID,
        webhookConfigId: TEST_IDS.WEBHOOK_CONFIG_ID,
        eventName: "workflow.transition.completed",
        attemptNumber: 2,
        httpStatus: 200,
        responseBody: "ok",
      })
    );
  });

  it("deliver logs failed request when fetch throws", async () => {
    const config = {
      id: TEST_IDS.WEBHOOK_CONFIG_ID,
      tenantId: TEST_IDS.TENANT_A_ID,
      name: "workflow.transition.completed",
      url: "https://example.com/webhook",
      secret: "abc",
      eventTriggers: ["workflow.transition.completed"],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as WebhookConfig;

    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    webhookDeliveryLogRepository.insert.mockResolvedValue({} as never);

    await service.deliver(config, "workflow.transition.completed", { x: 1 });
    expect(webhookDeliveryLogRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        httpStatus: null,
        responseBody: null,
        deliveredAt: null,
      })
    );
  });
});

