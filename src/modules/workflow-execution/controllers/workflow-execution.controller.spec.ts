import { Test, TestingModule } from "@nestjs/testing";
import {
  mockApproverJwt,
  mockRequestorJwt,
  MockWorkflowInstance,
  TEST_IDS,
} from "@app/shared/test-utils";
import { WorkflowExecutionController } from "./workflow-execution.controller";
import { WorkflowExecutionService } from "../services/workflow-execution.service";
import { CreateInstanceDto } from "../dto/create-instance.dto";
import { ExecuteTransitionDto } from "../dto/execute-transition.dto";
import { FindWorkflowInstanceDto } from "../dto/find-workflow-instance.dto";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

describe("WorkflowExecutionController", () => {
  let controller: WorkflowExecutionController;
  let service: jest.Mocked<WorkflowExecutionService>;

  beforeEach(async () => {
    service = {
      createInstance: jest.fn(),
      executeTransition: jest.fn(),
      cancelInstance: jest.fn(),
      getInstanceDetail: jest.fn(),
      getInstanceList: jest.fn(),
      getAllowedTransitions: jest.fn(),
    } as unknown as jest.Mocked<WorkflowExecutionService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowExecutionController],
      providers: [{ provide: WorkflowExecutionService, useValue: service }],
    }).compile();

    controller = module.get<WorkflowExecutionController>(WorkflowExecutionController);
  });

  it("create delegates and wraps response", async () => {
    const dto: CreateInstanceDto = {
      workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
      payload: { leaveDays: 2 },
    };
    service.createInstance.mockResolvedValue(MockWorkflowInstance as never);

    const result = await controller.create(dto, mockRequestorJwt);
    expect(service.createInstance).toHaveBeenCalledWith(
      TEST_IDS.WORKFLOW_DEFINITION_ID,
      dto.payload,
      mockRequestorJwt
    );
    expect(result.status).toBe("success");
  });

  it("list delegates and returns count wrapper", async () => {
    const dto: FindWorkflowInstanceDto = { page: 1, limit: 10, status: WorkflowInstanceStatus.ACTIVE };
    service.getInstanceList.mockResolvedValue({ data: [MockWorkflowInstance as never], total: 1 } as never);

    const result = await controller.list(dto, TEST_IDS.TENANT_A_ID);
    expect(result).toEqual({ status: "success", count: 1, data: [MockWorkflowInstance] });
  });

  it("getOne delegates by id and tenant", async () => {
    service.getInstanceDetail.mockResolvedValue(MockWorkflowInstance as never);
    const result = await controller.getOne({ id: TEST_IDS.INSTANCE_ID }, TEST_IDS.TENANT_A_ID);
    expect(service.getInstanceDetail).toHaveBeenCalledWith(TEST_IDS.INSTANCE_ID, TEST_IDS.TENANT_A_ID);
    expect(result).toEqual({ status: "success", data: MockWorkflowInstance });
  });

  it("getAllowedTransitions delegates with actor roleIds", async () => {
    service.getAllowedTransitions.mockResolvedValue([{ id: "t1", name: "Approve" }] as never);
    const result = await controller.getAllowedTransitions({ id: TEST_IDS.INSTANCE_ID }, mockApproverJwt);
    expect(service.getAllowedTransitions).toHaveBeenCalledWith(
      TEST_IDS.INSTANCE_ID,
      mockApproverJwt.tenantId,
      mockApproverJwt.roleIds
    );
    expect(result).toEqual([{ id: "t1", name: "Approve" }]);
  });

  it("executeTransition delegates with dto values", async () => {
    const dto: ExecuteTransitionDto = {
      transitionId: TEST_IDS.TRANSITION_ID,
      lastKnownVersion: 1,
      comment: "ok",
      idempotencyKey: "idem-1",
    };
    service.executeTransition.mockResolvedValue(MockWorkflowInstance as never);
    const result = await controller.executeTransition({ id: TEST_IDS.INSTANCE_ID }, dto, mockRequestorJwt);

    expect(service.executeTransition).toHaveBeenCalledWith(
      TEST_IDS.INSTANCE_ID,
      TEST_IDS.TRANSITION_ID,
      1,
      "ok",
      mockRequestorJwt,
      "idem-1"
    );
    expect(result.status).toBe("success");
  });

  it("cancel delegates and wraps response", async () => {
    service.cancelInstance.mockResolvedValue(MockWorkflowInstance as never);
    const result = await controller.cancel({ id: TEST_IDS.INSTANCE_ID }, mockRequestorJwt);
    expect(service.cancelInstance).toHaveBeenCalledWith(TEST_IDS.INSTANCE_ID, mockRequestorJwt);
    expect(result.status).toBe("success");
  });
});

