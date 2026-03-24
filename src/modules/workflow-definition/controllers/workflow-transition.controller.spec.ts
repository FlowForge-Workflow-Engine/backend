/**
 * Unit Tests: WorkflowTransitionController
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - WorkflowTransitionService: delegation + wrapper response shapes
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowTransitionController } from "./workflow-transition.controller";
import { WorkflowTransitionService } from "../services/workflow-transition.service";
import { FindWorkflowTransitionDto } from "../dto/find-workflow-transition.dto";
import { CreateWorkflowTransitionDto } from "../dto/create-workflow-transition.dto";
import { CreateTransitionRuleDto, TransitionSchemaFieldDto } from "../dto/create-transition-rule.dto";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { TEST_IDS } from "@app/shared/test-utils";
import { MockOpenTransition, MockTransitionRule, MockWorkflowTransition } from "@app/shared/test-utils";
import { WorkflowTransition } from "../entities/workflow-transition.entity";
import { TransitionRule } from "../entities/transition-rule.entity";
import { WorkflowInstanceFormSchema } from "@app/shared/interfaces/contracts/workflow-query.contract";

describe("WorkflowTransitionController", () => {
  let controller: WorkflowTransitionController;
  let service: jest.Mocked<WorkflowTransitionService>;

  const tenantId = TEST_IDS.TENANT_A_ID;
  const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;
  const transitionId = TEST_IDS.TRANSITION_ID;
  const ruleId = TEST_IDS.RULE_ID;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      remove: jest.fn(),
      addRule: jest.fn(),
      getAllRules: jest.fn(),
      removeRule: jest.fn(),
    } as unknown as jest.Mocked<WorkflowTransitionService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowTransitionController],
      providers: [{ provide: WorkflowTransitionService, useValue: service }],
    }).compile();

    controller = module.get<WorkflowTransitionController>(WorkflowTransitionController);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findAll()", () => {
    it("returns {status, count: data.length, data}", async () => {
      const dto: FindWorkflowTransitionDto = { page: 1, limit: 10 };
      const transitions: WorkflowTransition[] = [MockWorkflowTransition as unknown as WorkflowTransition];
      service.findAll.mockResolvedValue(transitions);

      const defParam: IdParamDto = { id: definitionId };
      const result = await controller.findAll(dto, defParam, tenantId);

      expect(service.findAll).toHaveBeenCalledWith(dto, definitionId, tenantId);
      expect(result.status).toBe("success");
      expect(result.count).toBe(1);
      expect(result.data).toEqual(transitions);
    });
  });

  describe("create()", () => {
    it("delegates to service.create(definitionId, dto, tenantId)", async () => {
      const defParam: IdParamDto = { id: definitionId };
      const dto: CreateWorkflowTransitionDto = {
        name: "Submit for Review",
        fromStateId: TEST_IDS.INITIAL_STATE_ID,
        toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
        allowedRoleIds: [],
        requiresComment: false,
      };
      const created = MockWorkflowTransition as unknown as WorkflowTransition;
      service.create.mockResolvedValue(created);

      const result = await controller.create(defParam, dto, tenantId);
      expect(service.create).toHaveBeenCalledWith(definitionId, dto, tenantId);
      expect(result).toEqual({ status: "success", data: created });
    });
  });

  describe("findOne()", () => {
    it("delegates to service.findById(transitionId, tenantId)", async () => {
      const transition = MockOpenTransition as unknown as WorkflowTransition;
      service.findById.mockResolvedValue(transition);

      const result = await controller.findOne(transitionId, tenantId);
      expect(service.findById).toHaveBeenCalledWith(transitionId, tenantId);
      expect(result).toEqual({ status: "success", data: transition });
    });
  });

  describe("remove()", () => {
    it("delegates to service.remove(transitionId, tenantId) and returns void", async () => {
      service.remove.mockResolvedValue(undefined);
      const result = await controller.remove(transitionId, tenantId);
      expect(service.remove).toHaveBeenCalledWith(transitionId, tenantId);
      expect(result).toBeUndefined();
    });
  });

  describe("addRule()", () => {
    it("delegates to service.addRule(transitionId, dto, tenantId) and returns wrapper", async () => {
      const dto: CreateTransitionRuleDto = {
        ruleName: "leave-days-greater-than-7",
        ruleDefinition: { type: "expression", all: [] },
        evaluationOrder: 0,
        schemaFields: [
          {
            key: "days",
            type: "number",
            label: "Days",
            required: true,
          } as TransitionSchemaFieldDto,
        ],
      };

      const createdRule = MockTransitionRule as unknown as TransitionRule;
      service.addRule.mockResolvedValue(createdRule);

      const result = await controller.addRule(transitionId, dto, tenantId);
      expect(service.addRule).toHaveBeenCalledWith(transitionId, dto, tenantId);
      expect(result).toEqual({ status: "success", data: createdRule });
    });
  });

  describe("getAllRules()", () => {
    it("delegates to service.getAllRules(transitionId, tenantId)", async () => {
      const rules: TransitionRule[] = [MockTransitionRule as unknown as TransitionRule];
      service.getAllRules.mockResolvedValue(rules);

      const result = await controller.getAllRules(transitionId, tenantId);
      expect(service.getAllRules).toHaveBeenCalledWith(transitionId, tenantId);
      expect(result).toEqual({ status: "success", data: rules });
    });
  });

  describe("removeRule()", () => {
    it("delegates to service.removeRule(transitionId, ruleId, tenantId) and returns void", async () => {
      service.removeRule.mockResolvedValue(undefined);

      const result = await controller.removeRule(transitionId, ruleId, tenantId);
      expect(service.removeRule).toHaveBeenCalledWith(transitionId, ruleId, tenantId);
      expect(result).toBeUndefined();
    });
  });
});

