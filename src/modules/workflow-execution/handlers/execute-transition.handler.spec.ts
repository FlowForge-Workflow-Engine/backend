import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  mockApproverJwt,
  MockWorkflowInstance,
  TEST_IDS,
} from "@app/shared/test-utils";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { ExecuteTransitionHandler } from "./execute-transition.handler";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { ExecutionPublisher } from "../publishers/execution.publisher";
import { ExecuteTransitionCommand } from "../commands/execute-transition.command";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";
import { IWorkflowQueryContract } from "@app/shared/interfaces/contracts/workflow-query.contract";
import { RedisService } from "../../../infra/redis.service";

describe("ExecuteTransitionHandler", () => {
  let handler: ExecuteTransitionHandler;
  let redis: ReturnType<typeof createMockRedisService>;
  let instanceRepo: {
    findByIdAndTenant: jest.MockedFunction<WorkflowInstanceRepository["findByIdAndTenant"]>;
  };
  let workflowQuery: {
    getVersionSnapshot: jest.Mock;
    findDefinitionById: jest.Mock;
    getInstanceFormSchema: jest.Mock;
    countDefinitionsByTenant: jest.Mock;
    countPublishedDefinitionsByTenant: jest.Mock;
  };
  let ruleEngine: { evaluateRules: jest.Mock };
  let publisher: {
    publishTransitionCompleted: jest.Mock;
    publishInstanceCompleted: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    redis = createMockRedisService();
    instanceRepo = { findByIdAndTenant: jest.fn() };
    workflowQuery = {
      getVersionSnapshot: jest.fn(),
      findDefinitionById: jest.fn(),
      getInstanceFormSchema: jest.fn(),
      countDefinitionsByTenant: jest.fn(),
      countPublishedDefinitionsByTenant: jest.fn(),
    };
    ruleEngine = { evaluateRules: jest.fn() };
    publisher = {
      publishTransitionCompleted: jest.fn(),
      publishInstanceCompleted: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (em: { query: jest.Mock }) => Promise<void>) => {
        const em = {
          query: jest
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce([[], 1]),
        };
        await cb(em);
      }),
    };

    handler = new ExecuteTransitionHandler(
      instanceRepo as unknown as WorkflowInstanceRepository,
      workflowQuery as unknown as IWorkflowQueryContract,
      ruleEngine,
      dataSource as unknown as DataSource,
      publisher as unknown as ExecutionPublisher,
      redis as unknown as RedisService
    );
  });

  it("returns cached instance for idempotency hit", async () => {
    redis.get.mockResolvedValueOnce(MockWorkflowInstance);
    const result = await handler.execute(
      new ExecuteTransitionCommand(
        TEST_IDS.INSTANCE_ID,
        TEST_IDS.TRANSITION_ID,
        1,
        "ok",
        mockApproverJwt,
        "idem-1"
      )
    );
    expect(result).toEqual(MockWorkflowInstance);
  });

  it("throws when idempotency lock is already claimed", async () => {
    redis.get.mockResolvedValueOnce(null);
    redis.setNX.mockResolvedValueOnce(false);
    await expect(
      handler.execute(
        new ExecuteTransitionCommand(
          TEST_IDS.INSTANCE_ID,
          TEST_IDS.TRANSITION_ID,
          1,
          "ok",
          mockApproverJwt,
          "idem-1"
        )
      )
    ).rejects.toThrow(ConflictException);
  });

  it("throws not found when instance does not exist", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue(null);
    await expect(
      handler.execute(
        new ExecuteTransitionCommand(
          TEST_IDS.INSTANCE_ID,
          TEST_IDS.TRANSITION_ID,
          1,
          "ok",
          mockApproverJwt
        )
      )
    ).rejects.toThrow(NotFoundException);
  });

  it("throws forbidden when actor role is not allowed", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue(MockWorkflowInstance as never);
    workflowQuery.getVersionSnapshot.mockResolvedValue({
      transitions: [
        {
          id: TEST_IDS.TRANSITION_ID,
          fromStateId: TEST_IDS.INITIAL_STATE_ID,
          toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
          name: "Submit",
          allowedRoleIds: ["another-role"],
          requiresComment: false,
          rules: [],
        },
      ],
      states: [{ id: TEST_IDS.INTERMEDIATE_STATE_ID, name: "Review", isTerminal: false }],
    });

    await expect(
      handler.execute(
        new ExecuteTransitionCommand(
          TEST_IDS.INSTANCE_ID,
          TEST_IDS.TRANSITION_ID,
          1,
          "ok",
          mockApproverJwt
        )
      )
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws when rule engine fails rules", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue(MockWorkflowInstance as never);
    workflowQuery.getVersionSnapshot.mockResolvedValue({
      transitions: [
        {
          id: TEST_IDS.TRANSITION_ID,
          fromStateId: TEST_IDS.INITIAL_STATE_ID,
          toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
          name: "Submit",
          allowedRoleIds: [],
          requiresComment: false,
          rules: [{ name: "rule-1" }],
        },
      ],
      states: [{ id: TEST_IDS.INTERMEDIATE_STATE_ID, name: "Review", isTerminal: false }],
    });
    ruleEngine.evaluateRules.mockResolvedValue({ passed: false, failedRules: ["rule-1"] });

    await expect(
      handler.execute(
        new ExecuteTransitionCommand(
          TEST_IDS.INSTANCE_ID,
          TEST_IDS.TRANSITION_ID,
          1,
          "ok",
          mockApproverJwt
        )
      )
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("completes transition, invalidates caches, and publishes events", async () => {
    instanceRepo.findByIdAndTenant
      .mockResolvedValueOnce({
        ...MockWorkflowInstance,
        status: WorkflowInstanceStatus.ACTIVE,
      } as never)
      .mockResolvedValueOnce({
        ...MockWorkflowInstance,
        currentStateName: "Approved",
        version: 2,
        status: WorkflowInstanceStatus.COMPLETED,
      } as never);

    workflowQuery.getVersionSnapshot.mockResolvedValue({
      transitions: [
        {
          id: TEST_IDS.TRANSITION_ID,
          fromStateId: TEST_IDS.INITIAL_STATE_ID,
          toStateId: TEST_IDS.TERMINAL_STATE_ID,
          name: "Approve",
          allowedRoleIds: [],
          requiresComment: false,
          rules: [],
        },
      ],
      states: [{ id: TEST_IDS.TERMINAL_STATE_ID, name: "Approved", isTerminal: true }],
    });
    ruleEngine.evaluateRules.mockResolvedValue({ passed: true, failedRules: [] });

    const result = await handler.execute(
      new ExecuteTransitionCommand(
        TEST_IDS.INSTANCE_ID,
        TEST_IDS.TRANSITION_ID,
        1,
        "done",
        mockApproverJwt,
        "idem-1"
      )
    );

    expect(result.version).toBe(2);
    expect(publisher.publishTransitionCompleted).toHaveBeenCalledTimes(1);
    expect(publisher.publishInstanceCompleted).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalled();
  });

  it("throws transition conflict when optimistic update affects zero rows", async () => {
    dataSource.transaction.mockImplementationOnce(async (cb: (em: { query: jest.Mock }) => Promise<void>) => {
      const em = {
        query: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce([[], 0]),
      };
      await cb(em);
    });
    instanceRepo.findByIdAndTenant.mockResolvedValue(MockWorkflowInstance as never);
    workflowQuery.getVersionSnapshot.mockResolvedValue({
      transitions: [
        {
          id: TEST_IDS.TRANSITION_ID,
          fromStateId: TEST_IDS.INITIAL_STATE_ID,
          toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
          name: "Submit",
          allowedRoleIds: [],
          requiresComment: false,
          rules: [],
        },
      ],
      states: [{ id: TEST_IDS.INTERMEDIATE_STATE_ID, name: "Review", isTerminal: false }],
    });

    await expect(
      handler.execute(
        new ExecuteTransitionCommand(
          TEST_IDS.INSTANCE_ID,
          TEST_IDS.TRANSITION_ID,
          1,
          "ok",
          mockApproverJwt
        )
      )
    ).rejects.toThrow(AppErrors.TRANSITION_CONFLICT);
  });
});

