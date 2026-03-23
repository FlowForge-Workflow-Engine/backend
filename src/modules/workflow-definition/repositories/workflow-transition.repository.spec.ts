/**
 * Unit Tests: WorkflowTransitionRepository
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - TypeORM Repository<WorkflowTransition>: entityRepo mock
 * - RequestContextService: QR fallback (no CLS QueryRunner)
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { WorkflowTransitionRepository } from "./workflow-transition.repository";
import { WorkflowTransition } from "../entities/workflow-transition.entity";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { MockOpenTransition, MockWorkflowTransition, TEST_IDS } from "@app/shared/test-utils";

describe("WorkflowTransitionRepository", () => {
  let repo: WorkflowTransitionRepository;
  let entityRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
    remove: jest.Mock;
    target: typeof WorkflowTransition;
  };
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  beforeEach(async () => {
    entityRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      target: WorkflowTransition,
    };
    requestContext = createMockRequestContextService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowTransitionRepository,
        { provide: getRepositoryToken(WorkflowTransition), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<WorkflowTransitionRepository>(WorkflowTransitionRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findByIdAndTenant()", () => {
    it("queries by id and tenantId", async () => {
      const found = MockWorkflowTransition as unknown as WorkflowTransition;
      entityRepo.findOne.mockResolvedValue(found);

      const result = await repo.findByIdAndTenant(TEST_IDS.TRANSITION_ID, TEST_IDS.TENANT_A_ID);
      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { id: TEST_IDS.TRANSITION_ID, tenantId: TEST_IDS.TENANT_A_ID },
      });
      expect(result).toEqual(found);
    });
  });

  describe("findByDefinitionAndTenant()", () => {
    it("applies workflowDefinitionId + tenantId and pagination skip/take with ordering", async () => {
      const page = 2;
      const limit = 10;
      const skip = (page - 1) * limit;
      const take = limit;

      const transitions = [MockWorkflowTransition as unknown as WorkflowTransition];
      entityRepo.find.mockResolvedValue(transitions);

      const result = await repo.findByDefinitionAndTenant(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID, {
        page,
        limit,
      });

      expect(result).toEqual(transitions);
      expect(entityRepo.find).toHaveBeenCalledWith({
        where: { workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID, tenantId: TEST_IDS.TENANT_A_ID },
        order: { createdAt: "ASC" },
        skip,
        take,
      });
    });
  });

  describe("findIdsByDefinitionAndTenant()", () => {
    it("selects only ids and maps them to string[]", async () => {
      entityRepo.find.mockResolvedValue([
        { id: MockWorkflowTransition.id },
        { id: MockOpenTransition.id },
      ]);

      const result = await repo.findIdsByDefinitionAndTenant(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);
      expect(entityRepo.find).toHaveBeenCalledWith({
        select: { id: true },
        where: { workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID, tenantId: TEST_IDS.TENANT_A_ID },
      });
      expect(result).toEqual([MockWorkflowTransition.id, MockOpenTransition.id]);
    });
  });

  describe("findByFromStateId()", () => {
    it("filters by fromStateId + tenantId", async () => {
      const transitions = [MockWorkflowTransition as unknown as WorkflowTransition];
      entityRepo.find.mockResolvedValue(transitions);

      const result = await repo.findByFromStateId(TEST_IDS.INITIAL_STATE_ID, TEST_IDS.TENANT_A_ID);
      expect(entityRepo.find).toHaveBeenCalledWith({
        where: { fromStateId: TEST_IDS.INITIAL_STATE_ID, tenantId: TEST_IDS.TENANT_A_ID },
      });
      expect(result).toEqual(transitions);
    });
  });

  describe("removeByDefinitionId()", () => {
    it("deletes by workflowDefinitionId and tenantId", async () => {
      await repo.removeByDefinitionId(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);
      expect(entityRepo.delete).toHaveBeenCalledWith({
        workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
        tenantId: TEST_IDS.TENANT_A_ID,
      });
    });
  });
});

