import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { TEST_IDS } from "@app/shared/test-utils";
import { NotificationTemplateRepository } from "./notification-template.repository";
import { NotificationTemplate } from "../entities/notification-template.entity";
import { NotificationEventTrigger } from "../constants/notification-event-trigger.enum";

describe("NotificationTemplateRepository", () => {
  let repo: NotificationTemplateRepository;
  let entityRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    target: typeof NotificationTemplate;
  };
  let txRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let manager: { query: jest.Mock; getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    entityRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn((d: unknown) => d),
      save: jest.fn((d: unknown) => Promise.resolve(d)),
      target: NotificationTemplate,
    };
    txRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
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
        NotificationTemplateRepository,
        { provide: getRepositoryToken(NotificationTemplate), useValue: entityRepo },
        { provide: RequestContextService, useValue: createMockRequestContextService() },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    repo = module.get<NotificationTemplateRepository>(NotificationTemplateRepository);
  });

  it("findActiveByEventTrigger uses tenant scoped transaction", async () => {
    txRepo.find.mockResolvedValue([{ id: "tpl-1" }]);
    const result = await repo.findActiveByEventTrigger(
      NotificationEventTrigger.WORKFLOW_INSTANCE_CREATED,
      TEST_IDS.TENANT_A_ID
    );
    expect(result).toHaveLength(1);
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it("insert writes via tenant scoped transaction", async () => {
    await repo.insert({
      tenantId: TEST_IDS.TENANT_A_ID,
      eventTrigger: NotificationEventTrigger.WORKFLOW_INSTANCE_CREATED,
      channel: "email",
      subjectTemplate: "subj",
      bodyTemplate: "tpl",
      isActive: true,
    } as never);
    expect(txRepo.create).toHaveBeenCalled();
    expect(txRepo.save).toHaveBeenCalled();
  });
});

