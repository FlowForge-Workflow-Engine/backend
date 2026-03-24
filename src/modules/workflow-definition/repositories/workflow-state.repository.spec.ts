/**
 * Unit Tests: WorkflowStateRepository
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - TypeORM Repository<WorkflowState>: entityRepo mock
 * - RequestContextService: QR fallback (no CLS QueryRunner)
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { WorkflowStateRepository } from "./workflow-state.repository";
import { WorkflowState } from "../entities/workflow-state.entity";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { MockInitialState, MockIntermediateState, TEST_IDS } from "@app/shared/test-utils";

describe("WorkflowStateRepository", () => {
  let repo: WorkflowStateRepository;
  let entityRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    delete: jest.Mock;
    remove: jest.Mock;
    target: typeof WorkflowState;
  };
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  beforeEach(async () => {
    entityRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      target: WorkflowState,
    };

    requestContext = createMockRequestContextService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowStateRepository,
        { provide: getRepositoryToken(WorkflowState), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<WorkflowStateRepository>(WorkflowStateRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findByIdAndTenant()", () => {
    it("queries by id and tenantId and returns matching state", async () => {
      const found = MockIntermediateState as unknown as WorkflowState;
      entityRepo.findOne.mockResolvedValue(found);

      const result = await repo.findByIdAndTenant(TEST_IDS.INTERMEDIATE_STATE_ID, TEST_IDS.TENANT_A_ID);

      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { id: TEST_IDS.INTERMEDIATE_STATE_ID, tenantId: TEST_IDS.TENANT_A_ID },
      });
      expect(result).toEqual(found);
    });
  });

  describe("findByDefinitionAndTenant()", () => {
    it("applies workflowDefinitionId + tenantId, pagination skip/take, and ordering", async () => {
      const page = 1;
      const limit = 20;
      const skip = 0;
      const take = 20;

      const states = [MockInitialState as unknown as WorkflowState];
      entityRepo.find.mockResolvedValue(states);

      const result = await repo.findByDefinitionAndTenant(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID, {
        page,
        limit,
      });

      expect(result).toEqual(states);
      expect(entityRepo.find).toHaveBeenCalledWith({
        where: {
          workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
          tenantId: TEST_IDS.TENANT_A_ID,
        },
        order: { createdAt: "ASC" },
        skip,
        take,
      });
    });
  });

  describe("findInitialState()", () => {
    it("filters by isInitial=true", async () => {
      const found = MockInitialState as unknown as WorkflowState;
      entityRepo.findOne.mockResolvedValue(found);

      const result = await repo.findInitialState(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);
      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID, tenantId: TEST_IDS.TENANT_A_ID, isInitial: true },
      });
      expect(result).toEqual(found);
    });
  });

  describe("countInitialStates()", () => {
    it("counts only initial states (isInitial=true)", async () => {
      entityRepo.count.mockResolvedValue(2);
      const result = await repo.countInitialStates(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);
      expect(result).toBe(2);
      expect(entityRepo.count).toHaveBeenCalledWith({
        where: { workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID, tenantId: TEST_IDS.TENANT_A_ID, isInitial: true },
      });
    });
  });

  describe("removeByDefinitionId()", () => {
    it("deletes states by workflowDefinitionId and tenantId", async () => {
      entityRepo.delete.mockResolvedValue({ affected: 1 });
      await repo.removeByDefinitionId(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);
      expect(entityRepo.delete).toHaveBeenCalledWith({
        workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
        tenantId: TEST_IDS.TENANT_A_ID,
      });
    });
  });
});

