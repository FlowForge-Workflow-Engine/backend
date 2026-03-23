/**
 * Unit Tests: WorkflowDefinitionRepository
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - TypeORM Repository<WorkflowDefinition>: entityRepo mock
 * - RequestContextService: QR fallback (no CLS QueryRunner)
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { WorkflowDefinitionRepository } from "./workflow-definition.repository";
import { WorkflowDefinition, WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { MockWorkflowDefinition, TEST_IDS } from "@app/shared/test-utils";

describe("WorkflowDefinitionRepository", () => {
  let repo: WorkflowDefinitionRepository;
  let entityRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    count: jest.Mock;
    remove: jest.Mock;
    target: typeof WorkflowDefinition;
  };
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  beforeEach(async () => {
    entityRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      remove: jest.fn(),
      target: WorkflowDefinition,
    };

    requestContext = createMockRequestContextService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowDefinitionRepository,
        { provide: getRepositoryToken(WorkflowDefinition), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<WorkflowDefinitionRepository>(WorkflowDefinitionRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findByIdAndTenant()", () => {
    it("queries by id and tenantId and returns matching definition", async () => {
      const found = MockWorkflowDefinition as unknown as WorkflowDefinition;
      entityRepo.findOne.mockResolvedValue(found);

      const result = await repo.findByIdAndTenant(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);

      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { id: TEST_IDS.WORKFLOW_DEFINITION_ID, tenantId: TEST_IDS.TENANT_A_ID },
      });
      expect(result).toEqual(found);
    });
  });

  describe("findAllByTenant()", () => {
    it("applies tenant filter, pagination skip/take, and ordering", async () => {
      const page = 2;
      const limit = 5;
      const skip = (page - 1) * limit;
      const take = limit;

      const found = [MockWorkflowDefinition as unknown as WorkflowDefinition];
      entityRepo.findAndCount.mockResolvedValue([found, 9]);

      const result = await repo.findAllByTenant(TEST_IDS.TENANT_A_ID, { page, limit });
      expect(result).toEqual([found, 9]);

      expect(entityRepo.findAndCount).toHaveBeenCalledWith({
        where: { tenantId: TEST_IDS.TENANT_A_ID },
        order: { createdAt: "DESC" },
        skip,
        take,
      });
    });
  });

  describe("countByTenant()", () => {
    it("counts without status filter when options.status is not provided", async () => {
      entityRepo.count.mockResolvedValue(7);

      const result = await repo.countByTenant(TEST_IDS.TENANT_A_ID);
      expect(result).toBe(7);
      expect(entityRepo.count).toHaveBeenCalledWith({ where: { tenantId: TEST_IDS.TENANT_A_ID } });
    });

    it("counts with status filter when options.status is provided", async () => {
      entityRepo.count.mockResolvedValue(3);

      const result = await repo.countByTenant(TEST_IDS.TENANT_A_ID, { status: WorkflowDefinitionStatus.PUBLISHED });
      expect(result).toBe(3);
      expect(entityRepo.count).toHaveBeenCalledWith({
        where: { tenantId: TEST_IDS.TENANT_A_ID, status: WorkflowDefinitionStatus.PUBLISHED },
      });
    });
  });

  describe("remove()", () => {
    it("delegates removal to entityRepo.remove", async () => {
      entityRepo.remove.mockResolvedValue(undefined);
      const entity = MockWorkflowDefinition as unknown as WorkflowDefinition;

      await repo.remove(entity);

      expect(entityRepo.remove).toHaveBeenCalledWith(entity);
    });
  });
});

