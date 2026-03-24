import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { TEST_IDS } from "@app/shared/test-utils";
import { WebhookDeliveryLogRepository } from "./webhook-delivery-log.repository";
import { WebhookDeliveryLog } from "../entities/webhook-delivery-log.entity";

describe("WebhookDeliveryLogRepository", () => {
  let repo: WebhookDeliveryLogRepository;
  let entityRepo: { target: typeof WebhookDeliveryLog };
  let txRepo: { create: jest.Mock; save: jest.Mock };
  let manager: { query: jest.Mock; getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    entityRepo = { target: WebhookDeliveryLog };
    txRepo = {
      create: jest.fn((d: unknown) => d),
      save: jest.fn((d: unknown) => Promise.resolve(d)),
    };
    manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(txRepo),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryLogRepository,
        { provide: getRepositoryToken(WebhookDeliveryLog), useValue: entityRepo },
        { provide: RequestContextService, useValue: createMockRequestContextService() },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    repo = module.get<WebhookDeliveryLogRepository>(WebhookDeliveryLogRepository);
  });

  it("insert persists delivery log in tenant transaction", async () => {
    await repo.insert({
      tenantId: TEST_IDS.TENANT_A_ID,
      webhookConfigId: TEST_IDS.WEBHOOK_CONFIG_ID,
      eventName: "workflow.transition.completed",
      payload: { x: 1 },
      attemptNumber: 1,
    } as never);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(txRepo.save).toHaveBeenCalled();
  });
});

