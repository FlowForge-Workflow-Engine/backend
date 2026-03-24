/**
 * Unit Tests: WorkflowQueryService
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - RedisService: cache-aside reads/writes
 * - WorkflowDefinitionRepository: definition summary and counts
 * - WorkflowVersionRepository: version snapshot fetches
 * - InstanceFormSchemaRepository: instance form schema reads + normalization
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowQueryService } from "./workflow-query.service";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { WorkflowVersionRepository } from "../repositories/workflow-version.repository";
import { InstanceFormSchemaRepository } from "../repositories/instance-form-schema.repository";
import { RedisService } from "../../../infra/redis.service";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import {
  MockPublishedWorkflowDefinition,
  MockWorkflowDefinition,
  TEST_IDS,
} from "@app/shared/test-utils";
import {
  WorkflowDefinitionSummary,
  WorkflowInstanceFormSchema,
  WorkflowInstanceFormField,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowDefinition } from "../entities/workflow-definition.entity";
import { WorkflowDefinitionVersion } from "../entities/workflow-definition-version.entity";
import { InstanceFormSchema } from "../entities/instance-form-schema.entity";

describe("WorkflowQueryService", () => {
  let service: WorkflowQueryService;

  let definitionRepository: {
    findByIdAndTenant: jest.MockedFunction<WorkflowDefinitionRepository["findByIdAndTenant"]>;
    countByTenant: jest.MockedFunction<WorkflowDefinitionRepository["countByTenant"]>;
  };

  let versionRepository: {
    findByDefinitionAndVersion: jest.MockedFunction<WorkflowVersionRepository["findByDefinitionAndVersion"]>;
  };

  let instanceFormSchemaRepository: {
    findByDefinitionAndTenant: jest.MockedFunction<InstanceFormSchemaRepository["findByDefinitionAndTenant"]>;
  };

  let redis: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    redis = createMockRedisService();

    definitionRepository = {
      findByIdAndTenant: jest.fn(),
      countByTenant: jest.fn(),
    };
    versionRepository = {
      findByDefinitionAndVersion: jest.fn(),
    };
    instanceFormSchemaRepository = {
      findByDefinitionAndTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowQueryService,
        { provide: WorkflowDefinitionRepository, useValue: definitionRepository },
        { provide: WorkflowVersionRepository, useValue: versionRepository },
        { provide: InstanceFormSchemaRepository, useValue: instanceFormSchemaRepository },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<WorkflowQueryService>(WorkflowQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findDefinitionById()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;
    const key = CacheKeys.workflowDefinition(tenantId, definitionId);

    it("returns cached summary when Redis has it", async () => {
      const cached: WorkflowDefinitionSummary = {
        id: definitionId,
        name: "Cached Name",
        currentVersion: 2,
        status: WorkflowDefinitionStatus.PUBLISHED,
      };

      redis.get.mockResolvedValueOnce(cached);

      const result = await service.findDefinitionById(definitionId, tenantId);
      expect(result).toEqual(cached);
      expect(definitionRepository.findByIdAndTenant).not.toHaveBeenCalled();
    });

    it("returns null when definition missing on cache miss", async () => {
      redis.get.mockResolvedValueOnce(null);
      definitionRepository.findByIdAndTenant.mockResolvedValue(null);

      const result = await service.findDefinitionById(definitionId, tenantId);
      expect(result).toBeNull();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("builds summary on cache miss and writes LONG TTL", async () => {
      redis.get.mockResolvedValueOnce(null);

      const definition = MockWorkflowDefinition as unknown as WorkflowDefinition;
      definitionRepository.findByIdAndTenant.mockResolvedValue(definition);

      const result = await service.findDefinitionById(definitionId, tenantId);

      expect(redis.set).toHaveBeenCalledWith(key, result, CacheTTL.LONG);
      expect(result.id).toBe(definitionId);
      expect(result.currentVersion).toBe(definition.currentVersion);
    });
  });

  describe("countDefinitionsByTenant()", () => {
    it("delegates to definitionRepository.countByTenant without status filter", async () => {
      definitionRepository.countByTenant.mockResolvedValue(12);

      const result = await service.countDefinitionsByTenant(TEST_IDS.TENANT_A_ID);
      expect(result).toBe(12);
      expect(definitionRepository.countByTenant).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID);
    });
  });

  describe("countPublishedDefinitionsByTenant()", () => {
    it("delegates to definitionRepository.countByTenant with status=PUBLISHED", async () => {
      definitionRepository.countByTenant.mockResolvedValue(3);

      const result = await service.countPublishedDefinitionsByTenant(TEST_IDS.TENANT_A_ID);
      expect(result).toBe(3);
      expect(definitionRepository.countByTenant).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID, {
        status: WorkflowDefinitionStatus.PUBLISHED,
      });
    });
  });

  describe("getVersionSnapshot()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;
    const versionNumber = 1;
    const key = CacheKeys.workflowVersionSnapshot(tenantId, definitionId, versionNumber);

    it("returns cached snapshot when present", async () => {
      const cached = { states: [], transitions: [] };
      redis.get.mockResolvedValueOnce(cached);

      const result = await service.getVersionSnapshot(definitionId, versionNumber, tenantId);
      expect(result).toEqual(cached);
      expect(versionRepository.findByDefinitionAndVersion).not.toHaveBeenCalled();
    });

    it("returns null when version record has no snapshot", async () => {
      redis.get.mockResolvedValueOnce(null);
      const record: WorkflowDefinitionVersion = {
        id: "v1",
        tenantId,
        workflowDefinitionId: definitionId,
        versionNumber,
        snapshot: undefined as unknown as Record<string, unknown>,
        isActive: true,
        publishedBy: TEST_IDS.ADMIN_USER_ID,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as WorkflowDefinitionVersion;

      versionRepository.findByDefinitionAndVersion.mockResolvedValue(record);

      const result = await service.getVersionSnapshot(definitionId, versionNumber, tenantId);
      expect(result).toBeNull();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("writes IMMUTABLE TTL and returns snapshot on cache miss", async () => {
      redis.get.mockResolvedValueOnce(null);

      const snapshot = { states: ["s1"], transitions: [] };
      const record: WorkflowDefinitionVersion = {
        id: "v1",
        tenantId,
        workflowDefinitionId: definitionId,
        versionNumber,
        snapshot,
        isActive: true,
        publishedBy: TEST_IDS.ADMIN_USER_ID,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as WorkflowDefinitionVersion;

      versionRepository.findByDefinitionAndVersion.mockResolvedValue(record);

      const result = await service.getVersionSnapshot(definitionId, versionNumber, tenantId);
      expect(result).toEqual(snapshot);
      expect(redis.set).toHaveBeenCalledWith(key, snapshot, CacheTTL.IMMUTABLE);
    });
  });

  describe("getInstanceFormSchema()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;
    const key = CacheKeys.workflowInstanceFormSchema(tenantId, definitionId);

    it("returns cached schema on hit", async () => {
      const cached: WorkflowInstanceFormSchema = {
        fields: [{ key: "days", type: "number", label: "Days", required: true }],
      };
      redis.get.mockResolvedValueOnce(cached);

      const result = await service.getInstanceFormSchema(definitionId, tenantId);
      expect(result).toEqual(cached);
      expect(instanceFormSchemaRepository.findByDefinitionAndTenant).not.toHaveBeenCalled();
    });

    it("normalizes schema on miss and sets LONG TTL", async () => {
      redis.get.mockResolvedValueOnce(null);

      const record = {
        schema: {
          fields: [
            { key: "days", type: "number", label: "Days", required: true },
            { key: "bad", type: "number", label: "Bad", required: "true" },
          ],
        },
      } as unknown as InstanceFormSchema;

      instanceFormSchemaRepository.findByDefinitionAndTenant.mockResolvedValue(record);

      const result = await service.getInstanceFormSchema(definitionId, tenantId);
      const expected: WorkflowInstanceFormSchema = {
        fields: [{ key: "days", type: "number", label: "Days", required: true }],
      };

      expect(result).toEqual(expected);
      expect(redis.set).toHaveBeenCalledWith(key, expected, CacheTTL.LONG);
    });
  });
});

