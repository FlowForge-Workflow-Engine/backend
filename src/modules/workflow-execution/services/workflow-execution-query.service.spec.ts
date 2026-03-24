import { Test, TestingModule } from "@nestjs/testing";
import { TEST_IDS } from "@app/shared/test-utils";
import { WorkflowExecutionQueryService } from "./workflow-execution-query.service";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

describe("WorkflowExecutionQueryService", () => {
  let service: WorkflowExecutionQueryService;
  let workflowInstanceRepository: {
    countByTenant: jest.MockedFunction<WorkflowInstanceRepository["countByTenant"]>;
  };

  beforeEach(async () => {
    workflowInstanceRepository = {
      countByTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutionQueryService,
        { provide: WorkflowInstanceRepository, useValue: workflowInstanceRepository },
      ],
    }).compile();

    service = module.get<WorkflowExecutionQueryService>(WorkflowExecutionQueryService);
  });

  it("countActiveInstancesByTenant delegates with ACTIVE status", async () => {
    workflowInstanceRepository.countByTenant.mockResolvedValue(9);
    const result = await service.countActiveInstancesByTenant(TEST_IDS.TENANT_A_ID);

    expect(result).toBe(9);
    expect(workflowInstanceRepository.countByTenant).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID, {
      status: WorkflowInstanceStatus.ACTIVE,
    });
  });
});

