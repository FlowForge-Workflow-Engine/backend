import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { TEST_IDS } from "@app/shared/test-utils";
import { NotificationLogRepository } from "./notification-log.repository";
import { NotificationLog, NotificationStatus } from "../entities/notification-log.entity";

describe("NotificationLogRepository", () => {
  let repo: NotificationLogRepository;
  let entityRepo: {
    createQueryBuilder: jest.Mock;
    target: typeof NotificationLog;
  };
  let qb: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    execute: jest.Mock;
  };
  let txRepo: { create: jest.Mock; save: jest.Mock; update: jest.Mock };
  let manager: { query: jest.Mock; getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    entityRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      target: NotificationLog,
    };
    txRepo = {
      create: jest.fn((d: unknown) => d),
      save: jest.fn((d: unknown) => Promise.resolve(d)),
      update: jest.fn().mockResolvedValue(undefined),
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
        NotificationLogRepository,
        { provide: getRepositoryToken(NotificationLog), useValue: entityRepo },
        { provide: RequestContextService, useValue: createMockRequestContextService() },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    repo = module.get<NotificationLogRepository>(NotificationLogRepository);
  });

  it("incrementRetry performs atomic retry_count increment", async () => {
    await repo.incrementRetry("log-1");
    expect(qb.set).toHaveBeenCalledWith({ retryCount: expect.any(Function) });
  });

  it("insert and updateStatus run in tenant scoped transaction", async () => {
    await repo.insert({
      tenantId: TEST_IDS.TENANT_A_ID,
      channel: "email",
      recipientEmail: "x@y.com",
      status: NotificationStatus.PENDING,
    } as never);
    await repo.updateStatus("log-1", TEST_IDS.TENANT_A_ID, NotificationStatus.SENT, new Date());
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(txRepo.update).toHaveBeenCalled();
  });
});

