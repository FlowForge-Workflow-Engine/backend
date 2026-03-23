/**
 * Unit Tests: WorkflowDefinitionController
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - WorkflowDefinitionService: controller delegation and DTO mapping
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowDefinitionController } from "./workflow-definition.controller";
import { WorkflowDefinitionService } from "../services/workflow-definition.service";
import { CreateWorkflowDefinitionDto } from "../dto/create-workflow-definition.dto";
import { FindWorkflowDefinitionDto } from "../dto/find-workflow-definition.dto";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { mockAdminJwt, MockWorkflowDefinition, TEST_IDS } from "@app/shared/test-utils";
import { InstanceFormSchemaResponseDto } from "../dto/dto-response/instance-form-schema-response.dto";
import {
  WorkflowDefinitionVersionListResponseDto,
} from "../dto/dto-response/workflow-definition-response.dto";
import { WorkflowInstanceFormSchema } from "@app/shared/interfaces/contracts/workflow-query.contract";
import { WorkflowDefinition } from "../entities/workflow-definition.entity";
import { WorkflowDefinitionVersion } from "../entities/workflow-definition-version.entity";

describe("WorkflowDefinitionController", () => {
  let controller: WorkflowDefinitionController;
  let service: jest.Mocked<WorkflowDefinitionService>;

  const tenantId = TEST_IDS.TENANT_A_ID;
  const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      getInstanceFormSchema: jest.fn(),
      findVersions: jest.fn(),
      findVersionByNumber: jest.fn(),
      remove: jest.fn(),
      publish: jest.fn(),
      deprecate: jest.fn(),
    } as unknown as jest.Mocked<WorkflowDefinitionService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowDefinitionController],
      providers: [{ provide: WorkflowDefinitionService, useValue: service }],
    }).compile();

    controller = module.get<WorkflowDefinitionController>(WorkflowDefinitionController);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findAll()", () => {
    it("returns success wrapper with total count and data", async () => {
      const dto: FindWorkflowDefinitionDto = { page: 1, limit: 10 };
      const definitions: WorkflowDefinition[] = [MockWorkflowDefinition as unknown as WorkflowDefinition];
      service.findAll.mockResolvedValue({ data: definitions, total: 42 });

      const result = await controller.findAll(dto, tenantId);
      expect(service.findAll).toHaveBeenCalledWith(dto, tenantId);
      expect(result).toEqual({ status: "success", count: 42, data: definitions });
    });
  });

  describe("create()", () => {
    it("calls service.create(dto, tenantId, actor.sub) and returns wrapper", async () => {
      const dto: CreateWorkflowDefinitionDto = { name: "My Workflow", description: "Desc" };
      const created = MockWorkflowDefinition as unknown as WorkflowDefinition;
      service.create.mockResolvedValue(created);

      const result = await controller.create(dto, tenantId, mockAdminJwt);
      expect(service.create).toHaveBeenCalledWith(dto, tenantId, mockAdminJwt.sub);
      expect(result).toEqual({ status: "success", data: created });
    });
  });

  describe("findOne()", () => {
    it("calls service.findById(id, tenantId) and returns wrapper", async () => {
      const param: IdParamDto = { id: definitionId };
      const found = MockWorkflowDefinition as unknown as WorkflowDefinition;
      service.findById.mockResolvedValue(found);

      const result = await controller.findOne(param, tenantId);
      expect(service.findById).toHaveBeenCalledWith(definitionId, tenantId);
      expect(result).toEqual({ status: "success", data: found });
    });
  });

  describe("getInstanceFormSchema()", () => {
    it("maps service schema to InstanceFormSchemaResponseDto", async () => {
      const param: IdParamDto = { id: definitionId };

      const schema: WorkflowInstanceFormSchema = {
        fields: [{ key: "days", type: "number", label: "Days", required: true }],
      };

      service.getInstanceFormSchema.mockResolvedValue(schema);

      const result = await controller.getInstanceFormSchema(param, tenantId);
      expect(service.getInstanceFormSchema).toHaveBeenCalledWith(definitionId, tenantId);
      expect(result.status).toBe("success");
      expect(result.data).toBeInstanceOf(InstanceFormSchemaResponseDto);
      expect(result.data.fields[0]).toEqual(schema.fields[0]);
    });
  });

  describe("findVersions()", () => {
    it("maps definition + versions to WorkflowDefinitionVersionListResponseDto", async () => {
      const param: IdParamDto = { id: definitionId };

      const definition = MockWorkflowDefinition as unknown as WorkflowDefinition;
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

      service.findVersions.mockResolvedValue({ definition, versions: [version] });

      const result = await controller.findVersions(param, tenantId);
      expect(service.findVersions).toHaveBeenCalledWith(definitionId, tenantId);
      expect(result.status).toBe("success");
      expect(result.data).toBeInstanceOf(WorkflowDefinitionVersionListResponseDto);
      expect(result.data.versions).toHaveLength(1);
      expect(result.data.versions[0].versionNumber).toBe(1);
    });
  });

  describe("findVersionByNumber()", () => {
    it("maps version entity to WorkflowDefinitionVersionDetailResponseDto", async () => {
      const param: IdParamDto = { id: definitionId };
      const version: WorkflowDefinitionVersion = {
        id: "v1",
        tenantId,
        workflowDefinitionId: definitionId,
        versionNumber: 2,
        snapshot: { transitions: [] },
        isActive: false,
        publishedBy: mockAdminJwt.sub,
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as WorkflowDefinitionVersion;

      service.findVersionByNumber.mockResolvedValue(version);

      const result = await controller.findVersionByNumber(param, 2, tenantId);
      expect(service.findVersionByNumber).toHaveBeenCalledWith(definitionId, 2, tenantId);
      expect(result.status).toBe("success");
      expect(result.data.versionNumber).toBe(2);
      expect(result.data.snapshot).toEqual({ transitions: [] });
    });
  });

  describe("remove()", () => {
    it("delegates to service.remove and returns void", async () => {
      const param: IdParamDto = { id: definitionId };
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(param, tenantId);
      expect(service.remove).toHaveBeenCalledWith(definitionId, tenantId);
      expect(result).toBeUndefined();
    });
  });

  describe("publish()", () => {
    it("delegates to service.publish and returns wrapper", async () => {
      const param: IdParamDto = { id: definitionId };
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

      service.publish.mockResolvedValue(version);

      const result = await controller.publish(param, tenantId, mockAdminJwt);
      expect(service.publish).toHaveBeenCalledWith(definitionId, tenantId, mockAdminJwt);
      expect(result).toEqual({ status: "success", data: version });
    });
  });

  describe("deprecate()", () => {
    it("delegates to service.deprecate and returns wrapper", async () => {
      const param: IdParamDto = { id: definitionId };
      const deprecated = MockWorkflowDefinition as unknown as WorkflowDefinition;
      service.deprecate.mockResolvedValue(deprecated);

      const result = await controller.deprecate(param, tenantId, mockAdminJwt);
      expect(service.deprecate).toHaveBeenCalledWith(definitionId, tenantId, mockAdminJwt.sub);
      expect(result).toEqual({ status: "success", data: deprecated });
    });
  });
});

