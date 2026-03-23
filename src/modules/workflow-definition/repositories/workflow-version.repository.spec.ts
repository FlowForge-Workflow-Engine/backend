/**
 * Unit Tests: WorkflowVersionRepository
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - TypeORM Repository<WorkflowDefinitionVersion>: entityRepo mock
 * - RequestContextService: QR fallback (no CLS QueryRunner)
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { WorkflowVersionRepository } from "./workflow-version.repository";
import { WorkflowDefinitionVersion } from "../entities/workflow-definition-version.entity";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { TEST_IDS } from "@app/shared/test-utils";

describe("WorkflowVersionRepository", () => {
  let repo: WorkflowVersionRepository;
  let entityRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
    target: typeof WorkflowDefinitionVersion;
  };
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  beforeEach(async () => {
    entityRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      target: WorkflowDefinitionVersion,
    };

    requestContext = createMockRequestContextService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowVersionRepository,
        { provide: getRepositoryToken(WorkflowDefinitionVersion), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<WorkflowVersionRepository>(WorkflowVersionRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findActiveVersion()", () => {
    it("finds the active version for a definition + tenant", async () => {
      const found = {
        id: "v1",
        tenantId: TEST_IDS.TENANT_A_ID,
        workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
        versionNumber: 1,
        snapshot: {},
        isActive: true,
        publishedBy: TEST_IDS.ADMIN_USER_ID,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      entityRepo.findOne.mockResolvedValue(found);

      const result = await repo.findActiveVersion(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);

      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID, tenantId: TEST_IDS.TENANT_A_ID, isActive: true },
      });
      expect(result).toEqual(found);
    });
  });

  describe("findByDefinitionAndVersion()", () => {
    it("finds version by definitionId + versionNumber + tenantId", async () => {
      const found = {
        id: "v1",
        tenantId: TEST_IDS.TENANT_A_ID,
        workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
        versionNumber: 2,
        snapshot: {},
        isActive: false,
        publishedBy: TEST_IDS.ADMIN_USER_ID,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      entityRepo.findOne.mockResolvedValue(found);

      const result = await repo.findByDefinitionAndVersion(TEST_IDS.WORKFLOW_DEFINITION_ID, 2, TEST_IDS.TENANT_A_ID);

      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID, versionNumber: 2, tenantId: TEST_IDS.TENANT_A_ID },
      });
      expect(result).toEqual(found);
    });
  });

  describe("findAllByDefinition()", () => {
    it("returns versions ordered by versionNumber DESC", async () => {
      const versions = [
        { id: "v1", versionNumber: 2 },
        { id: "v0", versionNumber: 1 },
      ];
      entityRepo.find.mockResolvedValue(versions);

      const result = await repo.findAllByDefinition(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);

      expect(entityRepo.find).toHaveBeenCalledWith({
        where: { workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID, tenantId: TEST_IDS.TENANT_A_ID },
        order: { versionNumber: "DESC" },
      });
      expect(result).toEqual(versions);
    });
  });

  describe("deactivateAll()", () => {
    it("updates isActive=false for all versions of a definition", async () => {
      entityRepo.update.mockResolvedValue(undefined);

      await repo.deactivateAll(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);

      expect(entityRepo.update).toHaveBeenCalledWith(
        { workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID, tenantId: TEST_IDS.TENANT_A_ID },
        { isActive: false }
      );
    });
  });
});

