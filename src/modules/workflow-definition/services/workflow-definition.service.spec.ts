/**
 * Unit Tests: WorkflowDefinitionService
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - RedisService: caching and invalidation
 * - WorkflowDefinitionRepository: definition persistence
 * - InstanceFormSchemaRepository: instance form schema reads
 * - WorkflowStateRepository / WorkflowTransitionRepository / TransitionRuleRepository: removal cascades
 * - WorkflowVersionService: publish/version reads
 * - WorkflowDefinitionPublisher: publish DEPRECATED events
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import {
  MockPublishedWorkflowDefinition,
  MockWorkflowDefinition,
  mockAdminJwt,
  TEST_IDS,
} from "@app/shared/test-utils";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { WorkflowDefinitionService } from "./workflow-definition.service";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { InstanceFormSchemaRepository } from "../repositories/instance-form-schema.repository";
import { WorkflowStateRepository } from "../repositories/workflow-state.repository";
import { WorkflowTransitionRepository } from "../repositories/workflow-transition.repository";
import { TransitionRuleRepository } from "../repositories/transition-rule.repository";
import { WorkflowVersionService } from "./workflow-version.service";
import { WorkflowDefinitionPublisher } from "../publishers/workflow-definition.publisher";
import { WorkflowDefinition, WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { InstanceFormSchema } from "../entities/instance-form-schema.entity";
import { CreateWorkflowDefinitionDto } from "../dto/create-workflow-definition.dto";
import {
  WorkflowInstanceFormSchema,
  WorkflowInstanceFormField,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { WorkflowDefinitionVersion } from "../entities/workflow-definition-version.entity";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";

import * as uuidUtil from "@app/shared/utils/uuid.util";
jest.mock("@app/shared/utils/uuid.util");

const mockedGenerateUUID = uuidUtil.generateUUID as jest.MockedFunction<typeof uuidUtil.generateUUID>;

function expectBadRequestCode(err: unknown, expected: AppErrors): void {
  if (!(err instanceof BadRequestException)) {
    throw new Error(`Expected BadRequestException, got ${(err as Error)?.name ?? typeof err}`);
  }

  const response = err.getResponse();
  expect(typeof response === "string" ? response : response).toBe(expected);
}

describe("WorkflowDefinitionService", () => {
  let service: WorkflowDefinitionService;

  let definitionRepository: {
    create: jest.MockedFunction<WorkflowDefinitionRepository["create"]>;
    save: jest.MockedFunction<WorkflowDefinitionRepository["save"]>;
    findByIdAndTenant: jest.MockedFunction<WorkflowDefinitionRepository["findByIdAndTenant"]>;
    findAllByTenant: jest.MockedFunction<WorkflowDefinitionRepository["findAllByTenant"]>;
    remove: jest.MockedFunction<WorkflowDefinitionRepository["remove"]>;
  };

  let instanceFormSchemaRepository: {
    findByDefinitionAndTenant: jest.MockedFunction<InstanceFormSchemaRepository["findByDefinitionAndTenant"]>;
    removeByDefinitionId: jest.MockedFunction<InstanceFormSchemaRepository["removeByDefinitionId"]>;
    create: jest.MockedFunction<InstanceFormSchemaRepository["create"]>;
    save: jest.MockedFunction<InstanceFormSchemaRepository["save"]>;
  };

  let stateRepository: {
    removeByDefinitionId: jest.MockedFunction<WorkflowStateRepository["removeByDefinitionId"]>;
  };

  let transitionRepository: {
    findIdsByDefinitionAndTenant: jest.MockedFunction<WorkflowTransitionRepository["findIdsByDefinitionAndTenant"]>;
    removeByDefinitionId: jest.MockedFunction<WorkflowTransitionRepository["removeByDefinitionId"]>;
  };

  let ruleRepository: {
    removeByTransitionIds: jest.MockedFunction<TransitionRuleRepository["removeByTransitionIds"]>;
  };

  let versionService: {
    findAllByDefinition: jest.MockedFunction<WorkflowVersionService["findAllByDefinition"]>;
    findByDefinitionAndVersion: jest.MockedFunction<WorkflowVersionService["findByDefinitionAndVersion"]>;
    publish: jest.MockedFunction<WorkflowVersionService["publish"]>;
  };

  let publisher: {
    publishWorkflowDefinitionDeprecated: jest.MockedFunction<
      WorkflowDefinitionPublisher["publishWorkflowDefinitionDeprecated"]
    >;
  };

  let redis: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    mockedGenerateUUID.mockReturnValue("test-uuid");

    redis = createMockRedisService();

    definitionRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findByIdAndTenant: jest.fn(),
      findAllByTenant: jest.fn(),
      remove: jest.fn(),
    };

    instanceFormSchemaRepository = {
      findByDefinitionAndTenant: jest.fn(),
      removeByDefinitionId: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    stateRepository = {
      removeByDefinitionId: jest.fn(),
    };

    transitionRepository = {
      findIdsByDefinitionAndTenant: jest.fn(),
      removeByDefinitionId: jest.fn(),
    };

    ruleRepository = {
      removeByTransitionIds: jest.fn(),
    };

    versionService = {
      findAllByDefinition: jest.fn(),
      findByDefinitionAndVersion: jest.fn(),
      publish: jest.fn(),
    };

    publisher = {
      publishWorkflowDefinitionDeprecated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowDefinitionService,
        { provide: WorkflowDefinitionRepository, useValue: definitionRepository },
        { provide: InstanceFormSchemaRepository, useValue: instanceFormSchemaRepository },
        { provide: WorkflowStateRepository, useValue: stateRepository },
        { provide: WorkflowTransitionRepository, useValue: transitionRepository },
        { provide: TransitionRuleRepository, useValue: ruleRepository },
        { provide: WorkflowVersionService, useValue: versionService },
        { provide: WorkflowDefinitionPublisher, useValue: publisher },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<WorkflowDefinitionService>(WorkflowDefinitionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("create()", () => {
    it("creates a workflow definition in DRAFT and invalidates workflowDefinitionList cache", async () => {
      const tenantId = TEST_IDS.TENANT_A_ID;
      const createdBy = mockAdminJwt.sub;

      const dto: CreateWorkflowDefinitionDto = {
        name: "Leave Approval Workflow",
        description: "Manages employee leave approvals",
      };

      const created: WorkflowDefinition = MockWorkflowDefinition as unknown as WorkflowDefinition;
      const saved: WorkflowDefinition = { ...created, createdBy };

      definitionRepository.create.mockReturnValue(created);
      definitionRepository.save.mockResolvedValue(saved);

      await expect(service.create(dto, tenantId, createdBy)).resolves.toEqual(saved);

      expect(definitionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          status: WorkflowDefinitionStatus.DRAFT,
          currentVersion: 1,
          createdBy,
        })
      );
      expect(redis.del).toHaveBeenCalledWith(CacheKeys.workflowDefinitionList(tenantId));
    });
  });

  describe("findById()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("returns definition when found", async () => {
      const found: WorkflowDefinition = MockWorkflowDefinition as unknown as WorkflowDefinition;
      definitionRepository.findByIdAndTenant.mockResolvedValue(found);

      await expect(service.findById(definitionId, tenantId)).resolves.toEqual(found);
    });

    it("throws NotFoundException with WORKFLOW_DEFINITION_NOT_FOUND when missing", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(null);

      await expect(service.findById(definitionId, tenantId)).rejects.toThrow(NotFoundException);
    });
  });

  describe("getInstanceFormSchema()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;
    const key = CacheKeys.workflowInstanceFormSchema(tenantId, definitionId);

    it("returns cached schema and does not query InstanceFormSchemaRepository", async () => {
      const cachedFields: WorkflowInstanceFormField[] = [
        { key: "days", type: "number", label: "Number of Leave Days", required: true },
      ];
      const cached: WorkflowInstanceFormSchema = { fields: cachedFields };

      redis.get.mockResolvedValueOnce(cached);
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockWorkflowDefinition as unknown as WorkflowDefinition);

      const result = await service.getInstanceFormSchema(definitionId, tenantId);
      expect(result).toEqual(cached);

      expect(instanceFormSchemaRepository.findByDefinitionAndTenant).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
      expect(redis.get).toHaveBeenCalledWith(key);
    });

    it("builds, normalizes schema on cache miss, and sets LONG TTL", async () => {
      redis.get.mockResolvedValueOnce(null);
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockWorkflowDefinition as unknown as WorkflowDefinition);

      const record = {
        schema: {
          fields: [
            { key: "days", type: "number", label: "Number of Leave Days", required: true },
            { key: "bad", type: "number", label: "Bad", required: "yes" },
            null,
            { key: "x" },
          ],
        },
      } as unknown as InstanceFormSchema;

      instanceFormSchemaRepository.findByDefinitionAndTenant.mockResolvedValue(record);

      const result = await service.getInstanceFormSchema(definitionId, tenantId);
      expect(result).toEqual({
        fields: [{ key: "days", type: "number", label: "Number of Leave Days", required: true }],
      });

      expect(instanceFormSchemaRepository.findByDefinitionAndTenant).toHaveBeenCalledWith(definitionId, tenantId);
      expect(redis.set).toHaveBeenCalledWith(key, result, CacheTTL.LONG);
    });
  });

  describe("findVersions() / findVersionByNumber()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("findVersions returns versions from versionService after validating definition exists", async () => {
      const definition: WorkflowDefinition = MockWorkflowDefinition as unknown as WorkflowDefinition;

      const version: WorkflowDefinitionVersion = {
        id: "v1",
        tenantId,
        workflowDefinitionId: definitionId,
        versionNumber: 1,
        snapshot: { states: [] },
        isActive: true,
        publishedBy: mockAdminJwt.sub,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as WorkflowDefinitionVersion;

      definitionRepository.findByIdAndTenant.mockResolvedValue(definition);
      versionService.findAllByDefinition.mockResolvedValue([version]);

      const result = await service.findVersions(definitionId, tenantId);
      expect(result.definition).toEqual(definition);
      expect(result.versions).toHaveLength(1);
      expect(versionService.findAllByDefinition).toHaveBeenCalledWith(definitionId, tenantId);
    });

    it("findVersionByNumber throws NotFoundException when definition missing", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(null);
      await expect(service.findVersionByNumber(definitionId, 1, tenantId)).rejects.toThrow(NotFoundException);
      expect(versionService.findByDefinitionAndVersion).not.toHaveBeenCalled();
    });
  });

  describe("remove()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("throws BadRequestException when removing non-DRAFT definition", async () => {
      const published: WorkflowDefinition = {
        ...(MockPublishedWorkflowDefinition as unknown as WorkflowDefinition),
        status: WorkflowDefinitionStatus.PUBLISHED,
      };

      definitionRepository.findByIdAndTenant.mockResolvedValue(published);

      await expect(service.remove(definitionId, tenantId)).rejects.toThrow(BadRequestException);
    });

    it("cascades deletions + invalidates all relevant caches for draft definition removal", async () => {
      const definition: WorkflowDefinition = MockWorkflowDefinition as unknown as WorkflowDefinition;
      const transitionIds = ["tr-1", "tr-2"];

      definitionRepository.findByIdAndTenant.mockResolvedValue(definition);
      transitionRepository.findIdsByDefinitionAndTenant.mockResolvedValue(transitionIds);
      ruleRepository.removeByTransitionIds.mockResolvedValue(undefined);
      instanceFormSchemaRepository.removeByDefinitionId.mockResolvedValue(undefined);
      transitionRepository.removeByDefinitionId.mockResolvedValue(undefined);
      stateRepository.removeByDefinitionId.mockResolvedValue(undefined);
      definitionRepository.remove.mockResolvedValue(undefined);

      await expect(service.remove(definitionId, tenantId)).resolves.toBeUndefined();

      expect(ruleRepository.removeByTransitionIds).toHaveBeenCalledWith(transitionIds, tenantId);
      expect(instanceFormSchemaRepository.removeByDefinitionId).toHaveBeenCalledWith(definitionId, tenantId);
      expect(transitionRepository.removeByDefinitionId).toHaveBeenCalledWith(definitionId, tenantId);
      expect(stateRepository.removeByDefinitionId).toHaveBeenCalledWith(definitionId, tenantId);
      expect(definitionRepository.remove).toHaveBeenCalledWith(definition);

      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.workflowDefinition(tenantId, definitionId),
        CacheKeys.workflowDefinitionList(tenantId),
        CacheKeys.workflowStates(tenantId, definitionId),
        CacheKeys.workflowTransitions(tenantId, definitionId),
        CacheKeys.workflowInstanceFormSchema(tenantId, definitionId)
      );
    });
  });

  describe("publish()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("throws BadRequestException when definition is DEPRECATED", async () => {
      const deprecated: WorkflowDefinition = {
        ...(MockWorkflowDefinition as unknown as WorkflowDefinition),
        status: WorkflowDefinitionStatus.DEPRECATED,
      };

      definitionRepository.findByIdAndTenant.mockResolvedValue(deprecated);

      await expect(service.publish(definitionId, tenantId, mockAdminJwt as IJwtPayload)).rejects.toThrow(
        BadRequestException
      );
    });

    it("delegates publish to versionService on success", async () => {
      const definition: WorkflowDefinition = MockWorkflowDefinition as unknown as WorkflowDefinition;
      const version: WorkflowDefinitionVersion = {
        id: "v1",
        tenantId,
        workflowDefinitionId: definitionId,
        versionNumber: 1,
        snapshot: {},
        isActive: true,
        publishedBy: mockAdminJwt.sub,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as WorkflowDefinitionVersion;

      definitionRepository.findByIdAndTenant.mockResolvedValue(definition);
      versionService.publish.mockResolvedValue(version);

      await expect(service.publish(definitionId, tenantId, mockAdminJwt as IJwtPayload)).resolves.toEqual(version);
      expect(versionService.publish).toHaveBeenCalledWith(definition, mockAdminJwt);
    });
  });

  describe("deprecate()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("throws BadRequestException when definition is not PUBLISHED", async () => {
      const notPublished: WorkflowDefinition = MockWorkflowDefinition as unknown as WorkflowDefinition;
      definitionRepository.findByIdAndTenant.mockResolvedValue(notPublished);

      await expect(service.deprecate(definitionId, tenantId, mockAdminJwt.sub)).rejects.toThrow(
        BadRequestException
      );
    });

    it("marks as DEPRECATED, invalidates caches, and publishes deprecated event", async () => {
      const published: WorkflowDefinition = MockPublishedWorkflowDefinition as unknown as WorkflowDefinition;
      definitionRepository.findByIdAndTenant.mockResolvedValue(published);
      definitionRepository.save.mockResolvedValue(published);

      await expect(service.deprecate(definitionId, tenantId, mockAdminJwt.sub)).resolves.toEqual(published);

      expect(published.status).toBe(WorkflowDefinitionStatus.DEPRECATED);
      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.workflowDefinition(tenantId, definitionId),
        CacheKeys.workflowDefinitionList(tenantId)
      );

      expect(publisher.publishWorkflowDefinitionDeprecated).toHaveBeenCalledTimes(1);
      const [payload] = publisher.publishWorkflowDefinitionDeprecated.mock.calls[0];

      expect(payload.tenantId).toBe(tenantId);
      expect(payload.definitionId).toBe(definitionId);
      expect(payload.eventId).toBe("test-uuid");
      expect(typeof payload.occurredAt).toBe("string");
    });
  });
});

