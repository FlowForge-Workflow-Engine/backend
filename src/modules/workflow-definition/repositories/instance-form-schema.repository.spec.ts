/**
 * Unit Tests: InstanceFormSchemaRepository
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - TypeORM Repository<InstanceFormSchema>: entityRepo mock
 * - RequestContextService: QR fallback (no CLS QueryRunner)
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { InstanceFormSchemaRepository } from "./instance-form-schema.repository";
import { InstanceFormSchema } from "../entities/instance-form-schema.entity";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { TEST_IDS } from "@app/shared/test-utils";

describe("InstanceFormSchemaRepository", () => {
  let repo: InstanceFormSchemaRepository;
  let entityRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    remove: jest.Mock;
    target: typeof InstanceFormSchema;
  };
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  beforeEach(async () => {
    entityRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      target: InstanceFormSchema,
    };

    requestContext = createMockRequestContextService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstanceFormSchemaRepository,
        { provide: getRepositoryToken(InstanceFormSchema), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<InstanceFormSchemaRepository>(InstanceFormSchemaRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findByDefinitionAndTenant()", () => {
    it("finds schema by workflowDefinitionId and tenantId", async () => {
      const found = {
        id: "s1",
        tenantId: TEST_IDS.TENANT_A_ID,
        workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
        schema: { fields: [] },
      } as unknown as InstanceFormSchema;

      entityRepo.findOne.mockResolvedValue(found);

      const result = await repo.findByDefinitionAndTenant(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);
      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID, tenantId: TEST_IDS.TENANT_A_ID },
      });
      expect(result).toEqual(found);
    });
  });

  describe("removeByDefinitionId()", () => {
    it("deletes instance form schema by workflowDefinitionId and tenantId", async () => {
      entityRepo.delete.mockResolvedValue({ affected: 1 });
      await repo.removeByDefinitionId(TEST_IDS.WORKFLOW_DEFINITION_ID, TEST_IDS.TENANT_A_ID);

      expect(entityRepo.delete).toHaveBeenCalledWith({
        workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
        tenantId: TEST_IDS.TENANT_A_ID,
      });
    });
  });
});

