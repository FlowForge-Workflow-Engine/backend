import { NotFoundException } from "@nestjs/common";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { MockWorkflowInstance, TEST_IDS } from "@app/shared/test-utils";
import { GetAllowedTransitionsHandler } from "./get-allowed-transitions.handler";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { GetAllowedTransitionsQuery } from "../queries/get-allowed-transitions.query";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";
import { IWorkflowQueryContract } from "@app/shared/interfaces/contracts/workflow-query.contract";
import { RedisService } from "../../../infra/redis.service";

describe("GetAllowedTransitionsHandler", () => {
  let handler: GetAllowedTransitionsHandler;
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
    handler = new GetAllowedTransitionsHandler(
      instanceRepo as unknown as WorkflowInstanceRepository,
      workflowQuery as unknown as IWorkflowQueryContract,
      redis as unknown as RedisService
    );
  });

  it("throws when instance is missing", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue(null);
    await expect(
      handler.execute(new GetAllowedTransitionsQuery(TEST_IDS.INSTANCE_ID, TEST_IDS.TENANT_A_ID, []))
    ).rejects.toThrow(NotFoundException);
  });

  it("returns empty when instance is not active", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue({
      ...MockWorkflowInstance,
      status: WorkflowInstanceStatus.CANCELLED,
    } as never);
    const result = await handler.execute(
      new GetAllowedTransitionsQuery(TEST_IDS.INSTANCE_ID, TEST_IDS.TENANT_A_ID, [])
    );
    expect(result).toEqual([]);
  });

  it("returns cached transitions filtered by roles", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue(MockWorkflowInstance as never);
    redis.get.mockResolvedValueOnce([
      {
        id: TEST_IDS.TRANSITION_ID,
        name: "Approve",
        toStateId: TEST_IDS.TERMINAL_STATE_ID,
        toStateName: "Approved",
        requiresComment: false,
        allowedRoleIds: ["role-1"],
      },
    ]);
    const result = await handler.execute(
      new GetAllowedTransitionsQuery(TEST_IDS.INSTANCE_ID, TEST_IDS.TENANT_A_ID, ["role-1"])
    );
    expect(result).toHaveLength(1);
    expect(workflowQuery.getVersionSnapshot).not.toHaveBeenCalled();
  });

  it("computes from snapshot on cache miss and caches", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue(MockWorkflowInstance as never);
    redis.get.mockResolvedValueOnce(null);
    workflowQuery.getVersionSnapshot.mockResolvedValue({
      transitions: [
        {
          id: TEST_IDS.TRANSITION_ID,
          fromStateId: TEST_IDS.INITIAL_STATE_ID,
          toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
          name: "Submit",
          requiresComment: false,
          allowedRoleIds: [],
        },
      ],
      states: [{ id: TEST_IDS.INTERMEDIATE_STATE_ID, name: "Review" }],
    });
    const result = await handler.execute(
      new GetAllowedTransitionsQuery(TEST_IDS.INSTANCE_ID, TEST_IDS.TENANT_A_ID, ["role-1"])
    );
    expect(result).toHaveLength(1);
    expect(redis.set).toHaveBeenCalled();
  });
});

