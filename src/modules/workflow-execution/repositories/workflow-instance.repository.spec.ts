import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { MockWorkflowInstance, TEST_IDS } from "@app/shared/test-utils";
import { WorkflowInstanceRepository } from "./workflow-instance.repository";
import { WorkflowInstance } from "../entities/workflow-instance.entity";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

describe("WorkflowInstanceRepository", () => {
  let repo: WorkflowInstanceRepository;
  let entityRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    count: jest.Mock;
    target: typeof WorkflowInstance;
  };

  beforeEach(async () => {
    entityRepo = {
      create: jest.fn((data: unknown) => data),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      target: WorkflowInstance,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowInstanceRepository,
        { provide: getRepositoryToken(WorkflowInstance), useValue: entityRepo },
        { provide: RequestContextService, useValue: createMockRequestContextService() },
      ],
    }).compile();

    repo = module.get<WorkflowInstanceRepository>(WorkflowInstanceRepository);
  });

  it("findAllByTenant applies pagination and filters", async () => {
    entityRepo.findAndCount.mockResolvedValue([[MockWorkflowInstance], 1]);
    const result = await repo.findAllByTenant(TEST_IDS.TENANT_A_ID, {
      page: 2,
      limit: 5,
      status: WorkflowInstanceStatus.ACTIVE,
      workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
    });

    expect(result[1]).toBe(1);
    expect(entityRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TEST_IDS.TENANT_A_ID,
          status: WorkflowInstanceStatus.ACTIVE,
          workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
        }),
        skip: 5,
        take: 5,
      })
    );
  });

  it("countByTenant counts by tenant with optional status", async () => {
    entityRepo.count.mockResolvedValue(7);
    const result = await repo.countByTenant(TEST_IDS.TENANT_A_ID, {
      status: WorkflowInstanceStatus.ACTIVE,
    });
    expect(result).toBe(7);
    expect(entityRepo.count).toHaveBeenCalledWith({
      where: { tenantId: TEST_IDS.TENANT_A_ID, status: WorkflowInstanceStatus.ACTIVE },
    });
  });
});

