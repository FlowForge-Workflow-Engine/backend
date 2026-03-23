/**
 * Unit Tests: WorkflowVersionService
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - WorkflowDefinitionRepository: definition activation update
 * - WorkflowStateRepository / WorkflowTransitionRepository / TransitionRuleRepository: snapshot build inputs
 * - WorkflowVersionRepository: deactivate/create/save version records
 * - WorkflowDefinitionPublisher: WORKFLOW_DEFINITION_PUBLISHED publishing
 * - RedisService: invalidation of mutable caches (allSettled behavior)
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowVersionService } from "./workflow-version.service";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { WorkflowStateRepository } from "../repositories/workflow-state.repository";
import { WorkflowTransitionRepository } from "../repositories/workflow-transition.repository";
import { TransitionRuleRepository } from "../repositories/transition-rule.repository";
import { WorkflowVersionRepository } from "../repositories/workflow-version.repository";
import { WorkflowDefinitionPublisher } from "../publishers/workflow-definition.publisher";
import { RedisService } from "../../../infra/redis.service";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import {
  MockInitialState,
  MockOpenTransition,
  MockTerminalState,
  MockTransitionRule,
  MockWorkflowDefinition,
  MockWorkflowTransition,
  TEST_IDS,
} from "@app/shared/test-utils";
import { WorkflowDefinition, WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { CacheKeys } from "../../../infra/cache-keys";
import { WorkflowDefinitionVersion } from "../entities/workflow-definition-version.entity";
import { mockAdminJwt } from "@app/shared/test-utils";
import { WorkflowState } from "../entities/workflow-state.entity";
import { WorkflowTransition } from "../entities/workflow-transition.entity";
import { TransitionRule } from "../entities/transition-rule.entity";
import * as uuidUtil from "@app/shared/utils/uuid.util";

jest.mock("@app/shared/utils/uuid.util");

const mockedGenerateUUID = uuidUtil.generateUUID as jest.MockedFunction<typeof uuidUtil.generateUUID>;

describe("WorkflowVersionService", () => {
  let service: WorkflowVersionService;

  let definitionRepository: {
    save: jest.MockedFunction<WorkflowDefinitionRepository["save"]>;
  };

  let stateRepository: {
    findByDefinitionAndTenant: jest.MockedFunction<WorkflowStateRepository["findByDefinitionAndTenant"]>;
  };

  let transitionRepository: {
    findByDefinitionAndTenant: jest.MockedFunction<WorkflowTransitionRepository["findByDefinitionAndTenant"]>;
  };

  let ruleRepository: {
    findByTransitionId: jest.MockedFunction<TransitionRuleRepository["findByTransitionId"]>;
  };

  let versionRepository: {
    findAllByDefinition: jest.MockedFunction<WorkflowVersionRepository["findAllByDefinition"]>;
    findByDefinitionAndVersion: jest.MockedFunction<WorkflowVersionRepository["findByDefinitionAndVersion"]>;
    deactivateAll: jest.MockedFunction<WorkflowVersionRepository["deactivateAll"]>;
    create: jest.MockedFunction<WorkflowVersionRepository["create"]>;
    save: jest.MockedFunction<WorkflowVersionRepository["save"]>;
  };

  let publisher: {
    publishWorkflowDefinitionPublished: jest.MockedFunction<
      WorkflowDefinitionPublisher["publishWorkflowDefinitionPublished"]
    >;
  };

  let redis: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    mockedGenerateUUID.mockReturnValue("test-uuid");
    redis = createMockRedisService();

    definitionRepository = {
      save: jest.fn(),
    };
    stateRepository = {
      findByDefinitionAndTenant: jest.fn(),
    };
    transitionRepository = {
      findByDefinitionAndTenant: jest.fn(),
    };
    ruleRepository = {
      findByTransitionId: jest.fn(),
    };
    versionRepository = {
      findAllByDefinition: jest.fn(),
      findByDefinitionAndVersion: jest.fn(),
      deactivateAll: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    publisher = {
      publishWorkflowDefinitionPublished: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowVersionService,
        { provide: WorkflowDefinitionRepository, useValue: definitionRepository },
        { provide: WorkflowStateRepository, useValue: stateRepository },
        { provide: WorkflowTransitionRepository, useValue: transitionRepository },
        { provide: TransitionRuleRepository, useValue: ruleRepository },
        { provide: WorkflowVersionRepository, useValue: versionRepository },
        { provide: WorkflowDefinitionPublisher, useValue: publisher },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<WorkflowVersionService>(WorkflowVersionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findAllByDefinition()", () => {
    it("delegates to versionRepository.findAllByDefinition", async () => {
      const versions: WorkflowDefinitionVersion[] = [
        {
          id: "v1",
          tenantId: TEST_IDS.TENANT_A_ID,
          workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
          versionNumber: 1,
          snapshot: {},
          isActive: true,
          publishedBy: mockAdminJwt.sub,
          publishedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as WorkflowDefinitionVersion,
      ];

      versionRepository.findAllByDefinition.mockResolvedValue(versions);

      const result = await service.findAllByDefinition(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);
      expect(result).toEqual(versions);
      expect(versionRepository.findAllByDefinition).toHaveBeenCalledWith(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);
    });
  });

  describe("findByDefinitionAndVersion()", () => {
    it("throws NotFoundException with DEFINITION_VERSION_NOT_FOUND when version missing", async () => {
      versionRepository.findByDefinitionAndVersion.mockResolvedValue(null);

      await expect(
        service.findByDefinitionAndVersion(TEST_IDS.WORKFLOW_DEFINITION_ID, 99, TEST_IDS.TENANT_A_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it("returns version record when found", async () => {
      const version = {
        id: "v1",
        tenantId: TEST_IDS.TENANT_A_ID,
        workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
        versionNumber: 1,
        snapshot: {},
        isActive: true,
        publishedBy: mockAdminJwt.sub,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as WorkflowDefinitionVersion;

      versionRepository.findByDefinitionAndVersion.mockResolvedValue(version);

      const result = await service.findByDefinitionAndVersion(TEST_IDS.WORKFLOW_DEFINITION_ID, 1, TEST_IDS.TENANT_A_ID);
      expect(result).toEqual(version);
    });
  });

  describe("publish()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("builds snapshot, creates version, updates definition, invalidates caches (allSettled), and publishes event", async () => {
      const definition: WorkflowDefinition = { ...(MockWorkflowDefinition as unknown as WorkflowDefinition) };
      const originalCurrentVersion = definition.currentVersion;

      const states: WorkflowState[] = [
        MockInitialState as unknown as WorkflowState,
        MockTerminalState as unknown as WorkflowState,
      ];

      const t1: WorkflowTransition = MockWorkflowTransition as unknown as WorkflowTransition;
      const t2: WorkflowTransition = MockOpenTransition as unknown as WorkflowTransition;
      const transitions: WorkflowTransition[] = [t1, t2];

      const rulesForT1: TransitionRule[] = [
        { ...(MockTransitionRule as unknown as TransitionRule), transitionId: t1.id } as TransitionRule,
      ];
      const rulesForT2: TransitionRule[] = [
        { ...(MockTransitionRule as unknown as TransitionRule), transitionId: t2.id } as TransitionRule,
      ];

      stateRepository.findByDefinitionAndTenant.mockResolvedValue(states);
      transitionRepository.findByDefinitionAndTenant.mockResolvedValue(transitions);

      ruleRepository.findByTransitionId.mockImplementation((transitionId: string) => {
        if (transitionId === t1.id) return Promise.resolve(rulesForT1);
        return Promise.resolve(rulesForT2);
      });

      versionRepository.deactivateAll.mockResolvedValue(undefined);

      const createdVersion: WorkflowDefinitionVersion = {
        id: "version-1",
        tenantId,
        workflowDefinitionId: definitionId,
        versionNumber: definition.currentVersion,
        snapshot: {},
        isActive: true,
        publishedBy: mockAdminJwt.sub,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as WorkflowDefinitionVersion;

      versionRepository.create.mockImplementation(() => createdVersion);
      versionRepository.save.mockResolvedValue(createdVersion);
      definitionRepository.save.mockResolvedValue(definition);

      // Force one redis.del to reject to validate Promise.allSettled behavior
      const delMock = jest.fn()
        .mockRejectedValueOnce(new Error("redis down"))
        .mockResolvedValue(undefined);
      redis.del = delMock as unknown as typeof redis.del;

      await expect(service.publish(definition, mockAdminJwt)).resolves.toEqual(createdVersion);

      expect(versionRepository.deactivateAll).toHaveBeenCalledWith(definitionId, tenantId);
      expect(versionRepository.save).toHaveBeenCalled();
      expect(definitionRepository.save).toHaveBeenCalled();

      const definitionSavedArg = definitionRepository.save.mock.calls[0][0];
      expect(definitionSavedArg.status).toBe(WorkflowDefinitionStatus.PUBLISHED);
      expect(definitionSavedArg.currentVersion).toBe(originalCurrentVersion + 1);

      expect(redis.del).toHaveBeenCalledWith(CacheKeys.workflowDefinition(tenantId, definitionId));
      expect(redis.del).toHaveBeenCalledWith(CacheKeys.workflowDefinitionList(tenantId));
      expect(redis.del).toHaveBeenCalledWith(CacheKeys.workflowStates(tenantId, definitionId));
      expect(redis.del).toHaveBeenCalledWith(CacheKeys.workflowTransitions(tenantId, definitionId));

      expect(publisher.publishWorkflowDefinitionPublished).toHaveBeenCalledTimes(1);
      const [payload] = publisher.publishWorkflowDefinitionPublished.mock.calls[0];
      expect(payload.tenantId).toBe(tenantId);
      expect(payload.definitionId).toBe(definitionId);
      expect(payload.versionNumber).toBe(1);
      expect(payload.publishedByUserId).toBe(mockAdminJwt.sub);
      expect(payload.publishedByEmail).toBe(mockAdminJwt.email);
      expect(payload.publishedByRole).toBe(mockAdminJwt.roles[0]);
      expect(payload.eventId).toBe("test-uuid");
      expect(typeof payload.occurredAt).toBe("string");

      // Snapshot structure sanity checks
      const createArg = versionRepository.create.mock.calls[0][0];
      expect(createArg.snapshot).toBeDefined();
      const snapshot = createArg.snapshot as Record<string, unknown>;
      expect((snapshot.states as Array<unknown>).length).toBe(2);
      expect((snapshot.transitions as Array<unknown>).length).toBe(2);
    });
  });
});

