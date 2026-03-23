import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  mockRequestorJwt,
  MockWorkflowInstance,
  TEST_IDS,
} from "@app/shared/test-utils";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { CancelInstanceHandler } from "./cancel-instance.handler";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { ExecutionPublisher } from "../publishers/execution.publisher";
import { CancelInstanceCommand } from "../commands/cancel-instance.command";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";
import { RedisService } from "../../../infra/redis.service";

describe("CancelInstanceHandler", () => {
  let handler: CancelInstanceHandler;
  let redis: ReturnType<typeof createMockRedisService>;
  let instanceRepo: {
    findByIdAndTenant: jest.MockedFunction<WorkflowInstanceRepository["findByIdAndTenant"]>;
  };
  let publisher: { publishInstanceCancelled: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    redis = createMockRedisService();
    instanceRepo = { findByIdAndTenant: jest.fn() };
    publisher = { publishInstanceCancelled: jest.fn() };
    dataSource = {
      transaction: jest.fn(async (cb: (em: { query: jest.Mock }) => Promise<void>) => {
        const em = { query: jest.fn().mockResolvedValue(undefined) };
        await cb(em);
      }),
    };
    handler = new CancelInstanceHandler(
      instanceRepo as unknown as WorkflowInstanceRepository,
      dataSource as unknown as DataSource,
      publisher as unknown as ExecutionPublisher,
      redis as unknown as RedisService
    );
  });

  it("throws when instance not found", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue(null);
    await expect(
      handler.execute(new CancelInstanceCommand(TEST_IDS.INSTANCE_ID, mockRequestorJwt))
    ).rejects.toThrow(NotFoundException);
  });

  it("throws when instance is not active", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue({
      ...MockWorkflowInstance,
      status: WorkflowInstanceStatus.COMPLETED,
    } as never);
    await expect(
      handler.execute(new CancelInstanceCommand(TEST_IDS.INSTANCE_ID, mockRequestorJwt))
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("cancels instance, invalidates cache, and publishes event", async () => {
    instanceRepo.findByIdAndTenant
      .mockResolvedValueOnce(MockWorkflowInstance as never)
      .mockResolvedValueOnce({
        ...MockWorkflowInstance,
        status: WorkflowInstanceStatus.CANCELLED,
      } as never);

    const result = await handler.execute(
      new CancelInstanceCommand(TEST_IDS.INSTANCE_ID, mockRequestorJwt)
    );

    expect(result.status).toBe(WorkflowInstanceStatus.CANCELLED);
    expect(publisher.publishInstanceCancelled).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalled();
  });
});

