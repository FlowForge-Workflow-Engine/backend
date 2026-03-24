import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { TEST_IDS } from "@app/shared/test-utils";
import { WebhookConfigRepository } from "./webhook-config.repository";
import { WebhookConfig } from "../entities/webhook-config.entity";

describe("WebhookConfigRepository", () => {
  let repo: WebhookConfigRepository;
  let entityRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    target: typeof WebhookConfig;
  };
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    getMany: jest.Mock;
  };
  let txRepo: { createQueryBuilder: jest.Mock };
  let manager: { query: jest.Mock; getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    entityRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((d: unknown) => d),
      save: jest.fn((d: unknown) => Promise.resolve(d)),
      update: jest.fn(),
      delete: jest.fn(),
      target: WebhookConfig,
    };
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: "wh-1" }]),
    };
    txRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(txRepo),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookConfigRepository,
        { provide: getRepositoryToken(WebhookConfig), useValue: entityRepo },
        { provide: RequestContextService, useValue: createMockRequestContextService() },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    repo = module.get<WebhookConfigRepository>(WebhookConfigRepository);
  });

  it("findActiveByEventName filters event trigger with ANY()", async () => {
    const result = await repo.findActiveByEventName(
      "workflow.instance.created",
      TEST_IDS.TENANT_A_ID
    );
    expect(result).toHaveLength(1);
    expect(qb.andWhere).toHaveBeenCalledWith(":eventName = ANY(wc.eventTriggers)", {
      eventName: "workflow.instance.created",
    });
  });
});

