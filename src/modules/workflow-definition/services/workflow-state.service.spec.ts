/**
 * Unit Tests: WorkflowStateService
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - RedisService: cache invalidation
 * - WorkflowStateRepository: state persistence + queries
 * - WorkflowDefinitionRepository: definition status validation
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowStateService } from "./workflow-state.service";
import { WorkflowStateRepository } from "../repositories/workflow-state.repository";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import {
  MockIntermediateState,
  MockInitialState,
  MockTerminalState,
  MockWorkflowDefinition,
  MockWorkflowDefinition as MockDraftDefinition,
  TEST_IDS,
} from "@app/shared/test-utils";
import { WorkflowDefinition, WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowState } from "../entities/workflow-state.entity";
import { CreateWorkflowStateDto } from "../dto/create-workflow-state.dto";
import { FindWorkflowStateDto } from "../dto/find-workflow-state.dto";
import { UpdateWorkflowStateDto } from "../dto/update-workflow-state.dto";

describe("WorkflowStateService", () => {
  let service: WorkflowStateService;
  let stateRepository: {
    create: jest.MockedFunction<WorkflowStateRepository["create"]>;
    save: jest.MockedFunction<WorkflowStateRepository["save"]>;
    findByIdAndTenant: jest.MockedFunction<WorkflowStateRepository["findByIdAndTenant"]>;
    findByDefinitionAndTenant: jest.MockedFunction<WorkflowStateRepository["findByDefinitionAndTenant"]>;
    countInitialStates: jest.MockedFunction<WorkflowStateRepository["countInitialStates"]>;
    remove: jest.MockedFunction<WorkflowStateRepository["remove"]>;
    removeByDefinitionId: jest.MockedFunction<WorkflowStateRepository["removeByDefinitionId"]>;
  };

  let definitionRepository: {
    findByIdAndTenant: jest.MockedFunction<WorkflowDefinitionRepository["findByIdAndTenant"]>;
  };

  let redis: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    redis = createMockRedisService();

    stateRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findByIdAndTenant: jest.fn(),
      findByDefinitionAndTenant: jest.fn(),
      countInitialStates: jest.fn(),
      remove: jest.fn(),
      removeByDefinitionId: jest.fn(),
    };

    definitionRepository = {
      findByIdAndTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowStateService,
        { provide: WorkflowStateRepository, useValue: stateRepository },
        { provide: WorkflowDefinitionRepository, useValue: definitionRepository },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<WorkflowStateService>(WorkflowStateService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("create()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("throws NotFoundException when workflow definition does not exist", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(null);

      const dto: CreateWorkflowStateDto = {
        name: "Applied",
        isInitial: true,
        isTerminal: false,
        positionX: 10,
        positionY: 20,
        metadata: null as unknown as Record<string, unknown>,
      };

      await expect(service.create(definitionId, dto, tenantId)).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when workflow definition is not in DRAFT status", async () => {
      const notDraft: WorkflowDefinition = {
        ...(MockDraftDefinition as unknown as WorkflowDefinition),
        status: WorkflowDefinitionStatus.PUBLISHED,
      };
      definitionRepository.findByIdAndTenant.mockResolvedValue(notDraft);

      const dto: CreateWorkflowStateDto = {
        name: "Applied",
        isInitial: true,
        isTerminal: false,
        positionX: 10,
        positionY: 20,
        metadata: null as unknown as Record<string, unknown>,
      };

      await expect(service.create(definitionId, dto, tenantId)).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when adding a second initial state", async () => {
      const definition: WorkflowDefinition = MockDraftDefinition as unknown as WorkflowDefinition;
      definitionRepository.findByIdAndTenant.mockResolvedValue(definition);

      stateRepository.countInitialStates.mockResolvedValue(1);

      const dto: CreateWorkflowStateDto = {
        name: "Applied",
        isInitial: true,
        isTerminal: false,
        positionX: 10,
        positionY: 20,
        metadata: null as unknown as Record<string, unknown>,
      };

      await expect(service.create(definitionId, dto, tenantId)).rejects.toThrow(BadRequestException);
      expect(stateRepository.countInitialStates).toHaveBeenCalledWith(definitionId, tenantId);
    });

    it("creates a state and invalidates caches when workflow definition is draft", async () => {
      const definition: WorkflowDefinition = MockDraftDefinition as unknown as WorkflowDefinition;
      definitionRepository.findByIdAndTenant.mockResolvedValue(definition);

      stateRepository.countInitialStates.mockResolvedValue(0);

      const toCreate: WorkflowState = MockInitialState as unknown as WorkflowState;
      const saved: WorkflowState = { ...toCreate, id: "state-1" } as WorkflowState;

      stateRepository.create.mockReturnValue(toCreate);
      stateRepository.save.mockResolvedValue(saved);

      const dto: CreateWorkflowStateDto = {
        name: "Applied",
        isInitial: true,
        isTerminal: false,
        positionX: 100,
        positionY: 200,
        description: null as unknown as string,
        metadata: null as unknown as Record<string, unknown>,
      };

      await expect(service.create(definitionId, dto, tenantId)).resolves.toEqual(saved);

      expect(stateRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowDefinitionId: definitionId,
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          isInitial: true,
          isTerminal: false,
          positionX: dto.positionX ?? null,
          positionY: dto.positionY ?? null,
          metadata: dto.metadata ?? null,
        })
      );

      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.workflowDefinition(tenantId, definitionId),
        CacheKeys.workflowStates(tenantId, definitionId),
        CacheKeys.workflowDefinitionList(tenantId)
      );
    });
  });

  describe("findAll()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("delegates to stateRepository.findByDefinitionAndTenant with pagination params", async () => {
      const dto: FindWorkflowStateDto = { page: 2, limit: 5 };
      const states: WorkflowState[] = [MockIntermediateState as unknown as WorkflowState];

      stateRepository.findByDefinitionAndTenant.mockResolvedValue(states);

      const result = await service.findAll(dto, definitionId, tenantId);
      expect(result).toEqual(states);
      expect(stateRepository.findByDefinitionAndTenant).toHaveBeenCalledWith(definitionId, tenantId, {
        page: 2,
        limit: 5,
      });
    });
  });

  describe("findById()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const stateId = TEST_IDS.INTERMEDIATE_STATE_ID;

    it("returns state when found", async () => {
      const state: WorkflowState = MockIntermediateState as unknown as WorkflowState;
      stateRepository.findByIdAndTenant.mockResolvedValue(state);

      await expect(service.findById(stateId, tenantId)).resolves.toEqual(state);
    });

    it("throws NotFoundException when state missing", async () => {
      stateRepository.findByIdAndTenant.mockResolvedValue(null);
      await expect(service.findById(stateId, tenantId)).rejects.toThrow(NotFoundException);
    });
  });

  describe("update()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;
    const stateId = TEST_IDS.INTERMEDIATE_STATE_ID;

    it("throws NotFoundException when workflow definition missing", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(null);

      const dto: UpdateWorkflowStateDto = { name: "Updated" };
      await expect(service.update(definitionId, stateId, dto, tenantId)).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when workflow definition is not DRAFT", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue({
        ...(MockDraftDefinition as unknown as WorkflowDefinition),
        status: WorkflowDefinitionStatus.PUBLISHED,
      });

      const dto: UpdateWorkflowStateDto = { name: "Updated" };
      await expect(service.update(definitionId, stateId, dto, tenantId)).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException when state missing", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockDraftDefinition as unknown as WorkflowDefinition);
      stateRepository.findByIdAndTenant.mockResolvedValue(null);

      const dto: UpdateWorkflowStateDto = { name: "Updated" };
      await expect(service.update(definitionId, stateId, dto, tenantId)).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when state belongs to a different definition", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockDraftDefinition as unknown as WorkflowDefinition);

      const mismatchedState: WorkflowState = {
        ...(MockIntermediateState as unknown as WorkflowState),
        workflowDefinitionId: "some-other-definition",
      };
      stateRepository.findByIdAndTenant.mockResolvedValue(mismatchedState);

      const dto: UpdateWorkflowStateDto = { name: "Updated" };
      await expect(service.update(definitionId, stateId, dto, tenantId)).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when setting second initial state", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockDraftDefinition as unknown as WorkflowDefinition);

      const state: WorkflowState = {
        ...(MockIntermediateState as unknown as WorkflowState),
        isInitial: false,
      };
      stateRepository.findByIdAndTenant.mockResolvedValue(state);

      stateRepository.countInitialStates.mockResolvedValue(1);

      const dto: UpdateWorkflowStateDto = { isInitial: true };
      await expect(service.update(definitionId, stateId, dto, tenantId)).rejects.toThrow(BadRequestException);
      expect(stateRepository.countInitialStates).toHaveBeenCalledWith(definitionId, tenantId);
    });

    it("throws BadRequestException when removing the initial state", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockDraftDefinition as unknown as WorkflowDefinition);

      const state: WorkflowState = {
        ...(MockInitialState as unknown as WorkflowState),
        isInitial: true,
      };
      stateRepository.findByIdAndTenant.mockResolvedValue(state);

      const dto: UpdateWorkflowStateDto = { isInitial: false };
      await expect(service.update(definitionId, stateId, dto, tenantId)).rejects.toThrow(BadRequestException);
    });

    it("updates only provided fields and invalidates caches", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockDraftDefinition as unknown as WorkflowDefinition);

      const existing: WorkflowState = MockIntermediateState as unknown as WorkflowState;
      stateRepository.findByIdAndTenant.mockResolvedValue(existing);

      const saved: WorkflowState = {
        ...existing,
        name: "Renamed",
        description: null,
        positionX: null,
        positionY: 999,
        metadata: { color: "red" },
      };

      stateRepository.save.mockResolvedValue(saved);

      const dto: UpdateWorkflowStateDto = {
        name: "Renamed",
        description: null,
        positionX: null,
        positionY: 999,
        isInitial: existing.isInitial,
        metadata: { color: "red" },
      };

      await expect(service.update(definitionId, stateId, dto, tenantId)).resolves.toEqual(saved);

      expect(stateRepository.save).toHaveBeenCalled();
      const savedArg = stateRepository.save.mock.calls[0][0];
      expect(savedArg.name).toBe("Renamed");
      expect(savedArg.description).toBeNull();
      expect(savedArg.positionX).toBeNull();
      expect(savedArg.positionY).toBe(999);
      expect(savedArg.metadata).toEqual({ color: "red" });

      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.workflowDefinition(tenantId, definitionId),
        CacheKeys.workflowStates(tenantId, definitionId),
        CacheKeys.workflowTransitions(tenantId, definitionId),
        CacheKeys.workflowDefinitionList(tenantId)
      );
    });
  });

  describe("remove()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const stateId = TEST_IDS.INTERMEDIATE_STATE_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("throws NotFoundException when state missing", async () => {
      stateRepository.findByIdAndTenant.mockResolvedValue(null);
      await expect(service.remove(stateId, tenantId)).rejects.toThrow(NotFoundException);
    });

    it("removes state and invalidates caches", async () => {
      const state: WorkflowState = MockIntermediateState as unknown as WorkflowState;
      state.workflowDefinitionId = definitionId;
      stateRepository.findByIdAndTenant.mockResolvedValue(state);

      stateRepository.remove.mockResolvedValue(undefined);

      await expect(service.remove(stateId, tenantId)).resolves.toBeUndefined();

      expect(stateRepository.remove).toHaveBeenCalledWith(state);
      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.workflowDefinition(tenantId, definitionId),
        CacheKeys.workflowStates(tenantId, definitionId),
        CacheKeys.workflowTransitions(tenantId, definitionId),
        CacheKeys.workflowDefinitionList(tenantId)
      );
    });
  });
});

