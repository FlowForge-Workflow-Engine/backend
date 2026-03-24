/**
 * Unit Tests: WorkflowTransitionService
 * Module: workflow-definition
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - WorkflowDefinitionRepository / WorkflowStateRepository: validation reads
 * - WorkflowTransitionRepository: transition persistence and lookups
 * - TransitionRuleRepository: rule persistence + cascading deletes
 * - InstanceFormSchemaRepository: schema upsert/recompute
 * - RedisService: cache invalidation after mutations
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowTransitionService } from "./workflow-transition.service";
import { WorkflowTransitionRepository } from "../repositories/workflow-transition.repository";
import { WorkflowStateRepository } from "../repositories/workflow-state.repository";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { TransitionRuleRepository } from "../repositories/transition-rule.repository";
import { InstanceFormSchemaRepository } from "../repositories/instance-form-schema.repository";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import {
  MockIntermediateState,
  MockInitialState,
  MockOpenTransition,
  MockTerminalState,
  MockTransitionRule,
  MockWorkflowDefinition,
  MockWorkflowTransition,
  TEST_IDS,
} from "@app/shared/test-utils";
import { WorkflowDefinition, WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowState } from "../entities/workflow-state.entity";
import { WorkflowTransition } from "../entities/workflow-transition.entity";
import { TransitionRule } from "../entities/transition-rule.entity";
import { InstanceFormSchema } from "../entities/instance-form-schema.entity";
import { CreateWorkflowTransitionDto } from "../dto/create-workflow-transition.dto";
import { FindWorkflowTransitionDto } from "../dto/find-workflow-transition.dto";
import { CreateTransitionRuleDto } from "../dto/create-transition-rule.dto";
import { TransitionSchemaFieldDto } from "../dto/create-transition-rule.dto";
import { RuleFactNamespace, RuleType } from "@app/shared/interfaces/contracts/rule-engine.contract";
import { WorkflowDefinitionStatus as WStatus } from "../entities/workflow-definition.entity";

function expectMissingSchemaFields(err: unknown, expectedMissing: string[]): void {
  if (!(err instanceof BadRequestException)) {
    throw new Error("Expected BadRequestException");
  }

  const response = err.getResponse();
  if (typeof response !== "object" || response === null || !("errorCode" in response)) {
    throw new Error("BadRequestException missing structured response");
  }

  const record = response as Record<string, unknown>;
  expect(record.errorCode).toBe(AppErrors.TRANSITION_RULE_SCHEMA_FIELDS_MISSING);
  expect(record.missingSchemaFields).toEqual(expectedMissing);
}

describe("WorkflowTransitionService", () => {
  let service: WorkflowTransitionService;

  let transitionRepository: {
    create: jest.MockedFunction<WorkflowTransitionRepository["create"]>;
    save: jest.MockedFunction<WorkflowTransitionRepository["save"]>;
    findByIdAndTenant: jest.MockedFunction<WorkflowTransitionRepository["findByIdAndTenant"]>;
    findByDefinitionAndTenant: jest.MockedFunction<WorkflowTransitionRepository["findByDefinitionAndTenant"]>;
    remove: jest.MockedFunction<WorkflowTransitionRepository["remove"]>;
    removeByDefinitionId: jest.MockedFunction<WorkflowTransitionRepository["removeByDefinitionId"]>;
  };

  let stateRepository: {
    findByIdAndTenant: jest.MockedFunction<WorkflowStateRepository["findByIdAndTenant"]>;
  };

  let definitionRepository: {
    findByIdAndTenant: jest.MockedFunction<WorkflowDefinitionRepository["findByIdAndTenant"]>;
  };

  let ruleRepository: {
    create: jest.MockedFunction<TransitionRuleRepository["create"]>;
    save: jest.MockedFunction<TransitionRuleRepository["save"]>;
    findByTransitionId: jest.MockedFunction<TransitionRuleRepository["findByTransitionId"]>;
    findByIdAndTenant: jest.MockedFunction<TransitionRuleRepository["findByIdAndTenant"]>;
    remove: jest.MockedFunction<TransitionRuleRepository["remove"]>;
    removeByTransitionId: jest.MockedFunction<TransitionRuleRepository["removeByTransitionId"]>;
  };

  let instanceFormSchemaRepository: {
    findByDefinitionAndTenant: jest.MockedFunction<InstanceFormSchemaRepository["findByDefinitionAndTenant"]>;
    create: jest.MockedFunction<InstanceFormSchemaRepository["create"]>;
    save: jest.MockedFunction<InstanceFormSchemaRepository["save"]>;
  };

  let redis: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    redis = createMockRedisService();

    transitionRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findByIdAndTenant: jest.fn(),
      findByDefinitionAndTenant: jest.fn(),
      remove: jest.fn(),
      removeByDefinitionId: jest.fn(),
    };

    stateRepository = {
      findByIdAndTenant: jest.fn(),
    };

    definitionRepository = {
      findByIdAndTenant: jest.fn(),
    };

    ruleRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findByTransitionId: jest.fn(),
      findByIdAndTenant: jest.fn(),
      remove: jest.fn(),
      removeByTransitionId: jest.fn(),
    };

    instanceFormSchemaRepository = {
      findByDefinitionAndTenant: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowTransitionService,
        { provide: WorkflowTransitionRepository, useValue: transitionRepository },
        { provide: WorkflowStateRepository, useValue: stateRepository },
        { provide: WorkflowDefinitionRepository, useValue: definitionRepository },
        { provide: TransitionRuleRepository, useValue: ruleRepository },
        { provide: InstanceFormSchemaRepository, useValue: instanceFormSchemaRepository },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<WorkflowTransitionService>(WorkflowTransitionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("create()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("throws NotFoundException when workflow definition is missing", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(null);

      const dto: CreateWorkflowTransitionDto = {
        name: "Submit for Review",
        fromStateId: TEST_IDS.INITIAL_STATE_ID,
        toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
        allowedRoleIds: [],
        requiresComment: false,
      };

      await expect(service.create(definitionId, dto, tenantId)).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when workflow definition is not in DRAFT", async () => {
      const notDraft: WorkflowDefinition = {
        ...(MockWorkflowDefinition as unknown as WorkflowDefinition),
        status: WorkflowDefinitionStatus.PUBLISHED,
      };
      definitionRepository.findByIdAndTenant.mockResolvedValue(notDraft);

      const dto: CreateWorkflowTransitionDto = {
        name: "Submit for Review",
        fromStateId: TEST_IDS.INITIAL_STATE_ID,
        toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
        allowedRoleIds: [],
        requiresComment: false,
      };

      await expect(service.create(definitionId, dto, tenantId)).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException when fromState is missing", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockWorkflowDefinition as unknown as WorkflowDefinition);
      stateRepository.findByIdAndTenant.mockResolvedValueOnce(null);

      const dto: CreateWorkflowTransitionDto = {
        name: "Submit for Review",
        fromStateId: TEST_IDS.INITIAL_STATE_ID,
        toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
        allowedRoleIds: [],
        requiresComment: false,
      };

      await expect(service.create(definitionId, dto, tenantId)).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when toState is missing", async () => {
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockWorkflowDefinition as unknown as WorkflowDefinition);

      stateRepository.findByIdAndTenant.mockResolvedValueOnce(MockInitialState as unknown as WorkflowState);
      stateRepository.findByIdAndTenant.mockResolvedValueOnce(null);

      const dto: CreateWorkflowTransitionDto = {
        name: "Submit for Review",
        fromStateId: TEST_IDS.INITIAL_STATE_ID,
        toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
        allowedRoleIds: [],
        requiresComment: false,
      };

      await expect(service.create(definitionId, dto, tenantId)).rejects.toThrow(NotFoundException);
    });

    it("creates transition and invalidates caches", async () => {
      const definition = MockWorkflowDefinition as unknown as WorkflowDefinition;
      definitionRepository.findByIdAndTenant.mockResolvedValue(definition);

      stateRepository.findByIdAndTenant.mockResolvedValue(MockInitialState as unknown as WorkflowState);

      const created = MockWorkflowTransition as unknown as WorkflowTransition;
      const saved = { ...created, id: "transition-1" } as WorkflowTransition;

      transitionRepository.create.mockReturnValue(created);
      transitionRepository.save.mockResolvedValue(saved);

      const dto: CreateWorkflowTransitionDto = {
        name: "Submit for Review",
        fromStateId: TEST_IDS.INITIAL_STATE_ID,
        toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
        allowedRoleIds: [],
        requiresComment: false,
      };

      await expect(service.create(definitionId, dto, tenantId)).resolves.toEqual(saved);

      expect(transitionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowDefinitionId: definitionId,
          tenantId,
          name: dto.name,
          fromStateId: dto.fromStateId,
          toStateId: dto.toStateId,
          allowedRoleIds: dto.allowedRoleIds ?? [],
          requiresComment: dto.requiresComment ?? false,
        })
      );
      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.workflowDefinition(tenantId, definitionId),
        CacheKeys.workflowTransitions(tenantId, definitionId),
        CacheKeys.workflowDefinitionList(tenantId)
      );
    });
  });

  describe("findAll()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("delegates to transitionRepository.findByDefinitionAndTenant with pagination", async () => {
      const dto: FindWorkflowTransitionDto = { page: 1, limit: 10 };
      const transitions: WorkflowTransition[] = [MockWorkflowTransition as unknown as WorkflowTransition];
      transitionRepository.findByDefinitionAndTenant.mockResolvedValue(transitions);

      const result = await service.findAll(dto, definitionId, tenantId);
      expect(result).toEqual(transitions);
      expect(transitionRepository.findByDefinitionAndTenant).toHaveBeenCalledWith(definitionId, tenantId, {
        page: 1,
        limit: 10,
      });
    });
  });

  describe("findById()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const transitionId = TEST_IDS.TRANSITION_ID;

    it("returns transition when found", async () => {
      const transition: WorkflowTransition = MockWorkflowTransition as unknown as WorkflowTransition;
      transitionRepository.findByIdAndTenant.mockResolvedValue(transition);

      await expect(service.findById(transitionId, tenantId)).resolves.toEqual(transition);
    });

    it("throws NotFoundException when transition missing", async () => {
      transitionRepository.findByIdAndTenant.mockResolvedValue(null);
      await expect(service.findById(transitionId, tenantId)).rejects.toThrow(NotFoundException);
    });
  });

  describe("remove()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const transitionId = TEST_IDS.TRANSITION_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;

    it("removes transition and its rules, invalidating relevant caches", async () => {
      const transition: WorkflowTransition = {
        ...(MockWorkflowTransition as unknown as WorkflowTransition),
        workflowDefinitionId: definitionId,
      };
      transitionRepository.findByIdAndTenant.mockResolvedValue(transition);

      ruleRepository.removeByTransitionId.mockResolvedValue(undefined);
      transitionRepository.remove.mockResolvedValue(undefined);

      await expect(service.remove(transitionId, tenantId)).resolves.toBeUndefined();

      expect(ruleRepository.removeByTransitionId).toHaveBeenCalledWith(transitionId, tenantId);
      expect(transitionRepository.remove).toHaveBeenCalledWith(transition);
      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.workflowDefinition(tenantId, definitionId),
        CacheKeys.workflowTransitions(tenantId, definitionId),
        CacheKeys.workflowDefinitionList(tenantId)
      );
    });
  });

  describe("addRule()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;
    const transitionId = TEST_IDS.TRANSITION_ID;

    it("throws NotFoundException when transition does not exist", async () => {
      transitionRepository.findByIdAndTenant.mockResolvedValue(null);

      const dto: CreateTransitionRuleDto = {
        ruleName: "leave-days-greater-than-7",
        ruleDefinition: { type: RuleType.EXPRESSION, all: [] },
        evaluationOrder: 0,
        schemaFields: [],
      };

      await expect(service.addRule(transitionId, dto, tenantId)).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when parent workflow definition is missing", async () => {
      const transition: WorkflowTransition = MockWorkflowTransition as unknown as WorkflowTransition;
      transitionRepository.findByIdAndTenant.mockResolvedValue(transition);
      definitionRepository.findByIdAndTenant.mockResolvedValue(null);

      const dto: CreateTransitionRuleDto = {
        ruleName: "leave-days-greater-than-7",
        ruleDefinition: { type: RuleType.EXPRESSION, all: [] },
        evaluationOrder: 0,
      };

      await expect(service.addRule(transitionId, dto, tenantId)).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when parent definition is not DRAFT", async () => {
      const transition: WorkflowTransition = MockWorkflowTransition as unknown as WorkflowTransition;
      transitionRepository.findByIdAndTenant.mockResolvedValue(transition);

      const definition: WorkflowDefinition = {
        ...(MockWorkflowDefinition as unknown as WorkflowDefinition),
        status: WStatus.PUBLISHED,
      };
      definitionRepository.findByIdAndTenant.mockResolvedValue(definition);

      const dto: CreateTransitionRuleDto = {
        ruleName: "leave-days-greater-than-7",
        ruleDefinition: { type: RuleType.EXPRESSION, all: [] },
        evaluationOrder: 0,
      };

      await expect(service.addRule(transitionId, dto, tenantId)).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when required schema fields are missing", async () => {
      const transition: WorkflowTransition = MockWorkflowTransition as unknown as WorkflowTransition;
      transitionRepository.findByIdAndTenant.mockResolvedValue(transition);
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockWorkflowDefinition as unknown as WorkflowDefinition);

      const ruleDefinition = {
        type: RuleType.EXPRESSION,
        all: [
          {
            fact: RuleFactNamespace.PAYLOAD,
            path: "$.days",
            operator: "greaterThan",
            value: 7,
          },
        ],
      } as unknown as Record<string, unknown>;

      const dto: CreateTransitionRuleDto = {
        ruleName: "leave-days-greater-than-7",
        ruleDefinition,
        evaluationOrder: 0,
        schemaFields: [
          { key: "amount", type: "number", label: "Amount", required: true } as TransitionSchemaFieldDto,
        ],
      };

      await expect(service.addRule(transitionId, dto, tenantId)).rejects.toThrow(BadRequestException);

      try {
        await service.addRule(transitionId, dto, tenantId);
      } catch (err) {
        expectMissingSchemaFields(err, ["days"]);
      }
    });

    it("succeeds when rule references no payload keys (required fields = [])", async () => {
      const transition: WorkflowTransition = MockWorkflowTransition as unknown as WorkflowTransition;
      transitionRepository.findByIdAndTenant.mockResolvedValue(transition);
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockWorkflowDefinition as unknown as WorkflowDefinition);

      const ruleDefinition = {
        type: RuleType.EXPRESSION,
        all: [{ fact: RuleFactNamespace.USER, path: "$.role", operator: "equal", value: "Admin" }],
      } as unknown as Record<string, unknown>;

      const dto: CreateTransitionRuleDto = {
        ruleName: "user-has-role",
        ruleDefinition,
        evaluationOrder: 0,
      };

      const createdRule: TransitionRule = MockTransitionRule as unknown as TransitionRule;
      const savedRule: TransitionRule = { ...createdRule, id: "rule-1" } as TransitionRule;

      ruleRepository.create.mockReturnValue(createdRule);
      ruleRepository.save.mockResolvedValue(savedRule);

      await expect(service.addRule(transitionId, dto, tenantId)).resolves.toEqual(savedRule);

      expect(instanceFormSchemaRepository.findByDefinitionAndTenant).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.workflowTransitions(tenantId, transition.workflowDefinitionId),
        CacheKeys.workflowInstanceFormSchema(tenantId, transition.workflowDefinitionId)
      );
    });

    it("creates a rule and upserts instance form schema when schemaFields are provided", async () => {
      const transition: WorkflowTransition = MockWorkflowTransition as unknown as WorkflowTransition;
      transitionRepository.findByIdAndTenant.mockResolvedValue(transition);
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockWorkflowDefinition as unknown as WorkflowDefinition);

      const ruleDefinition = {
        type: RuleType.EXPRESSION,
        all: [
          {
            fact: RuleFactNamespace.PAYLOAD,
            path: "$.days",
            operator: "greaterThan",
            value: 7,
          },
        ],
      } as unknown as Record<string, unknown>;

      const dto: CreateTransitionRuleDto = {
        ruleName: "leave-days-greater-than-7",
        ruleDefinition,
        evaluationOrder: 0,
        schemaFields: [
          { key: "days", type: "number", label: "Number of Leave Days", required: true } as TransitionSchemaFieldDto,
        ],
      };

      const createdRule: TransitionRule = MockTransitionRule as unknown as TransitionRule;
      const savedRule: TransitionRule = { ...createdRule, id: "rule-1" } as TransitionRule;
      ruleRepository.create.mockReturnValue(createdRule);
      ruleRepository.save.mockResolvedValue(savedRule);

      instanceFormSchemaRepository.findByDefinitionAndTenant.mockResolvedValue(null);
      instanceFormSchemaRepository.create.mockReturnValue({
        workflowDefinitionId: definitionId,
        tenantId,
        schema: { fields: [] },
      } as unknown as InstanceFormSchema);
      instanceFormSchemaRepository.save.mockResolvedValue({
        workflowDefinitionId: definitionId,
        tenantId,
        schema: { fields: [{ key: "days", type: "number", label: "Number of Leave Days", required: true }] },
      } as unknown as InstanceFormSchema);

      await expect(service.addRule(transitionId, dto, tenantId)).resolves.toEqual(savedRule);

      expect(instanceFormSchemaRepository.save).toHaveBeenCalled();

      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.workflowTransitions(tenantId, transition.workflowDefinitionId),
        CacheKeys.workflowInstanceFormSchema(tenantId, transition.workflowDefinitionId)
      );
    });
  });

  describe("getAllRules()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const transitionId = TEST_IDS.TRANSITION_ID;

    it("lists rules for transition after validating transition exists", async () => {
      const transition: WorkflowTransition = MockWorkflowTransition as unknown as WorkflowTransition;
      transitionRepository.findByIdAndTenant.mockResolvedValue(transition);

      const rules: TransitionRule[] = [MockTransitionRule as unknown as TransitionRule];
      ruleRepository.findByTransitionId.mockResolvedValue(rules);

      const result = await service.getAllRules(transitionId, tenantId);
      expect(result).toEqual(rules);
      expect(ruleRepository.findByTransitionId).toHaveBeenCalledWith(transitionId, tenantId);
    });
  });

  describe("removeRule()", () => {
    const tenantId = TEST_IDS.TENANT_A_ID;
    const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;
    const transitionId = TEST_IDS.TRANSITION_ID;
    const ruleId = TEST_IDS.RULE_ID;

    it("rebuilds instance form schema and invalidates caches, skipping schema save when no referenced payload keys remain", async () => {
      const transition: WorkflowTransition = {
        ...(MockWorkflowTransition as unknown as WorkflowTransition),
        workflowDefinitionId: definitionId,
      };
      const definition: WorkflowDefinition = MockWorkflowDefinition as unknown as WorkflowDefinition;

      const rule: TransitionRule = {
        ...(MockTransitionRule as unknown as TransitionRule),
        id: ruleId,
        transitionId,
        tenantId,
        ruleDefinition: {
          type: RuleType.EXPRESSION,
          all: [{ fact: RuleFactNamespace.USER, path: "$.role", operator: "equal", value: "Admin" }],
        } as unknown as Record<string, unknown>,
      };

      transitionRepository.findByIdAndTenant.mockResolvedValue(transition);
      definitionRepository.findByIdAndTenant.mockResolvedValue(definition);
      ruleRepository.findByIdAndTenant.mockResolvedValue(rule);

      // No transitions remaining => referencedPayloadKeys becomes empty, and instance form schema is absent.
      transitionRepository.findByDefinitionAndTenant.mockResolvedValue([]);
      instanceFormSchemaRepository.findByDefinitionAndTenant.mockResolvedValue(null);
      ruleRepository.remove.mockResolvedValue(undefined);
      ruleRepository.findByTransitionId.mockResolvedValue([]);

      await expect(service.removeRule(transitionId, ruleId, tenantId)).resolves.toBeUndefined();

      expect(ruleRepository.remove).toHaveBeenCalledWith(rule);
      expect(instanceFormSchemaRepository.save).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.workflowTransitions(tenantId, transition.workflowDefinitionId),
        CacheKeys.workflowInstanceFormSchema(tenantId, transition.workflowDefinitionId)
      );
    });

    it("throws NotFoundException when rule does not exist or does not belong to the transition", async () => {
      const transition: WorkflowTransition = MockWorkflowTransition as unknown as WorkflowTransition;
      transitionRepository.findByIdAndTenant.mockResolvedValue(transition);
      definitionRepository.findByIdAndTenant.mockResolvedValue(MockWorkflowDefinition as unknown as WorkflowDefinition);

      ruleRepository.findByIdAndTenant.mockResolvedValue(null);

      await expect(service.removeRule(transitionId, ruleId, tenantId)).rejects.toThrow(NotFoundException);
    });
  });
});

