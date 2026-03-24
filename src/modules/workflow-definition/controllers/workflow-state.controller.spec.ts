/**
 * Unit Tests: WorkflowStateController
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - WorkflowStateService: controller delegation and wrapper response shapes
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowStateController } from "./workflow-state.controller";
import { WorkflowStateService } from "../services/workflow-state.service";
import { FindWorkflowStateDto } from "../dto/find-workflow-state.dto";
import { CreateWorkflowStateDto } from "../dto/create-workflow-state.dto";
import { UpdateWorkflowStateDto } from "../dto/update-workflow-state.dto";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import {
  MockIntermediateState,
  MockInitialState,
  MockWorkflowDefinition,
  TEST_IDS,
} from "@app/shared/test-utils";
import { WorkflowState } from "../entities/workflow-state.entity";

describe("WorkflowStateController", () => {
  let controller: WorkflowStateController;
  let service: jest.Mocked<WorkflowStateService>;

  const tenantId = TEST_IDS.TENANT_A_ID;
  const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;
  const stateId = TEST_IDS.INTERMEDIATE_STATE_ID;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<WorkflowStateService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowStateController],
      providers: [{ provide: WorkflowStateService, useValue: service }],
    }).compile();

    controller = module.get<WorkflowStateController>(WorkflowStateController);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findAll()", () => {
    it("returns {status, count: data.length, data}", async () => {
      const dto: FindWorkflowStateDto = { page: 1, limit: 20 };
      const data: WorkflowState[] = [MockInitialState as unknown as WorkflowState, MockIntermediateState as unknown as WorkflowState];
      service.findAll.mockResolvedValue(data);

      const param: IdParamDto = { id: definitionId };
      const result = await controller.findAll(dto, param, tenantId);

      expect(service.findAll).toHaveBeenCalledWith(dto, definitionId, tenantId);
      expect(result.status).toBe("success");
      expect(result.count).toBe(2);
      expect(result.data).toEqual(data);
    });
  });

  describe("create()", () => {
    it("delegates to service.create(definitionId, dto, tenantId)", async () => {
      const param: IdParamDto = { id: definitionId };

      const dto: CreateWorkflowStateDto = {
        name: "Applied",
        description: "Start",
        isInitial: true,
        isTerminal: false,
        positionX: 100,
        positionY: 200,
        metadata: { color: "blue" },
      };

      const created = MockInitialState as unknown as WorkflowState;
      service.create.mockResolvedValue(created);

      const result = await controller.create(param, dto, tenantId);
      expect(service.create).toHaveBeenCalledWith(definitionId, dto, tenantId);
      expect(result).toEqual({ status: "success", data: created });
    });
  });

  describe("findOne()", () => {
    it("delegates to service.findById(stateId, tenantId)", async () => {
      const state: WorkflowState = MockIntermediateState as unknown as WorkflowState;
      service.findById.mockResolvedValue(state);

      const result = await controller.findOne(stateId, tenantId);
      expect(service.findById).toHaveBeenCalledWith(stateId, tenantId);
      expect(result).toEqual({ status: "success", data: state });
    });
  });

  describe("update()", () => {
    it("delegates to service.update(definitionId, stateId, dto, tenantId)", async () => {
      const definitionParam: IdParamDto = { id: definitionId };
      const dto: UpdateWorkflowStateDto = { name: "Renamed" };
      const updated = { ...(MockIntermediateState as unknown as WorkflowState), name: "Renamed" };
      service.update.mockResolvedValue(updated);

      const result = await controller.update(definitionParam, stateId, dto, tenantId);
      expect(service.update).toHaveBeenCalledWith(definitionId, stateId, dto, tenantId);
      expect(result).toEqual({ status: "success", data: updated });
    });
  });

  describe("remove()", () => {
    it("delegates to service.remove(stateId, tenantId) and returns void", async () => {
      service.remove.mockResolvedValue(undefined);

      const result = await controller.remove(stateId, tenantId);
      expect(service.remove).toHaveBeenCalledWith(stateId, tenantId);
      expect(result).toBeUndefined();
    });
  });
});

