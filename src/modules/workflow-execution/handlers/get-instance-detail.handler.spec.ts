import { NotFoundException } from "@nestjs/common";
import { MockWorkflowInstance, TEST_IDS } from "@app/shared/test-utils";
import { GetInstanceDetailHandler } from "./get-instance-detail.handler";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { GetInstanceDetailQuery } from "../queries/get-instance-detail.query";

describe("GetInstanceDetailHandler", () => {
  let handler: GetInstanceDetailHandler;
  let instanceRepo: {
    findByIdAndTenant: jest.MockedFunction<WorkflowInstanceRepository["findByIdAndTenant"]>;
  };

  beforeEach(() => {
    instanceRepo = { findByIdAndTenant: jest.fn() };
    handler = new GetInstanceDetailHandler(instanceRepo as unknown as WorkflowInstanceRepository);
  });

  it("throws NotFoundException when instance is missing", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue(null);
    await expect(
      handler.execute(new GetInstanceDetailQuery(TEST_IDS.INSTANCE_ID, TEST_IDS.TENANT_A_ID))
    ).rejects.toThrow(NotFoundException);
  });

  it("returns instance details when found", async () => {
    instanceRepo.findByIdAndTenant.mockResolvedValue(MockWorkflowInstance as never);
    const result = await handler.execute(
      new GetInstanceDetailQuery(TEST_IDS.INSTANCE_ID, TEST_IDS.TENANT_A_ID)
    );
    expect(result).toEqual(MockWorkflowInstance);
  });
});

