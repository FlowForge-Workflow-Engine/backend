import { MockWorkflowInstance, TEST_IDS } from "@app/shared/test-utils";
import { GetInstanceListHandler } from "./get-instance-list.handler";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { GetInstanceListQuery } from "../queries/get-instance-list.query";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

describe("GetInstanceListHandler", () => {
  let handler: GetInstanceListHandler;
  let instanceRepo: {
    findAllByTenant: jest.MockedFunction<WorkflowInstanceRepository["findAllByTenant"]>;
  };

  beforeEach(() => {
    instanceRepo = { findAllByTenant: jest.fn() };
    handler = new GetInstanceListHandler(instanceRepo as unknown as WorkflowInstanceRepository);
  });

  it("returns paginated list from repository", async () => {
    instanceRepo.findAllByTenant.mockResolvedValue([[MockWorkflowInstance as never], 1]);
    const query = new GetInstanceListQuery(
      TEST_IDS.TENANT_A_ID,
      1,
      10,
      WorkflowInstanceStatus.ACTIVE,
      TEST_IDS.WORKFLOW_DEFINITION_ID
    );
    const result = await handler.execute(query);

    expect(result).toEqual({ data: [MockWorkflowInstance], total: 1, page: 1, limit: 10 });
    expect(instanceRepo.findAllByTenant).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID, {
      status: WorkflowInstanceStatus.ACTIVE,
      workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
      page: 1,
      limit: 10,
    });
  });
});

