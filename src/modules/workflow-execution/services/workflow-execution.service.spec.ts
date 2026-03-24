import { Test, TestingModule } from "@nestjs/testing";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  mockRequestorJwt,
  MockWorkflowInstance,
  TEST_IDS,
} from "@app/shared/test-utils";
import { WorkflowExecutionService } from "./workflow-execution.service";
import { CreateInstanceCommand } from "../commands/create-instance.command";
import { ExecuteTransitionCommand } from "../commands/execute-transition.command";
import { CancelInstanceCommand } from "../commands/cancel-instance.command";
import { GetInstanceDetailQuery } from "../queries/get-instance-detail.query";
import { GetInstanceListQuery } from "../queries/get-instance-list.query";
import { GetAllowedTransitionsQuery } from "../queries/get-allowed-transitions.query";
import { FindWorkflowInstanceDto } from "../dto/find-workflow-instance.dto";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

describe("WorkflowExecutionService", () => {
  let service: WorkflowExecutionService;
  let commandBus: { execute: jest.Mock };
  let queryBus: { execute: jest.Mock };

  beforeEach(async () => {
    commandBus = { execute: jest.fn() };
    queryBus = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutionService,
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
      ],
    }).compile();

    service = module.get<WorkflowExecutionService>(WorkflowExecutionService);
  });

  it("createInstance dispatches CreateInstanceCommand", async () => {
    commandBus.execute.mockResolvedValue(MockWorkflowInstance);
    const payload = { leaveDays: 2 };
    const result = await service.createInstance(TEST_IDS.WORKFLOW_DEFINITION_ID, payload, mockRequestorJwt);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const [cmd] = commandBus.execute.mock.calls[0];
    expect(cmd).toBeInstanceOf(CreateInstanceCommand);
    expect((cmd as CreateInstanceCommand).workflowDefinitionId).toBe(TEST_IDS.WORKFLOW_DEFINITION_ID);
    expect(result).toEqual(MockWorkflowInstance);
  });

  it("executeTransition dispatches ExecuteTransitionCommand", async () => {
    commandBus.execute.mockResolvedValue(MockWorkflowInstance);
    await service.executeTransition(
      TEST_IDS.INSTANCE_ID,
      TEST_IDS.TRANSITION_ID,
      1,
      "ok",
      mockRequestorJwt,
      "idem-1"
    );

    const [cmd] = commandBus.execute.mock.calls[0];
    expect(cmd).toBeInstanceOf(ExecuteTransitionCommand);
    expect((cmd as ExecuteTransitionCommand).idempotencyKey).toBe("idem-1");
  });

  it("cancelInstance dispatches CancelInstanceCommand", async () => {
    commandBus.execute.mockResolvedValue(MockWorkflowInstance);
    await service.cancelInstance(TEST_IDS.INSTANCE_ID, mockRequestorJwt);
    const [cmd] = commandBus.execute.mock.calls[0];
    expect(cmd).toBeInstanceOf(CancelInstanceCommand);
  });

  it("getInstanceDetail dispatches GetInstanceDetailQuery", async () => {
    queryBus.execute.mockResolvedValue(MockWorkflowInstance);
    await service.getInstanceDetail(TEST_IDS.INSTANCE_ID, TEST_IDS.TENANT_A_ID);
    const [query] = queryBus.execute.mock.calls[0];
    expect(query).toBeInstanceOf(GetInstanceDetailQuery);
  });

  it("getInstanceList dispatches GetInstanceListQuery with filters", async () => {
    queryBus.execute.mockResolvedValue({ data: [MockWorkflowInstance], total: 1, page: 1, limit: 10 });
    const dto: FindWorkflowInstanceDto = {
      page: 1,
      limit: 10,
      status: WorkflowInstanceStatus.ACTIVE,
      workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
    };
    await service.getInstanceList(dto, TEST_IDS.TENANT_A_ID);
    const [query] = queryBus.execute.mock.calls[0];
    expect(query).toBeInstanceOf(GetInstanceListQuery);
  });

  it("getAllowedTransitions dispatches GetAllowedTransitionsQuery", async () => {
    queryBus.execute.mockResolvedValue([]);
    await service.getAllowedTransitions(TEST_IDS.INSTANCE_ID, TEST_IDS.TENANT_A_ID, ["role-1"]);
    const [query] = queryBus.execute.mock.calls[0];
    expect(query).toBeInstanceOf(GetAllowedTransitionsQuery);
  });
});

