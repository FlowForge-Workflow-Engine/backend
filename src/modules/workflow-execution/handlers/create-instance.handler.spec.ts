import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import {
  mockRequestorJwt,
  MockPublishedWorkflowDefinition,
  MockWorkflowInstance,
  TEST_IDS,
} from "@app/shared/test-utils";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { CreateInstanceHandler } from "./create-instance.handler";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { ExecutionPublisher } from "../publishers/execution.publisher";
import { CreateInstanceCommand } from "../commands/create-instance.command";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";
import { IWorkflowQueryContract } from "@app/shared/interfaces/contracts/workflow-query.contract";

import * as uuidUtil from "@app/shared/utils/uuid.util";
jest.mock("@app/shared/utils/uuid.util");
const mockGenerateUUID = uuidUtil.generateUUID as jest.MockedFunction<typeof uuidUtil.generateUUID>;

describe("CreateInstanceHandler", () => {
  let handler: CreateInstanceHandler;

  let instanceRepo: {
    create: jest.MockedFunction<WorkflowInstanceRepository["create"]>;
    save: jest.MockedFunction<WorkflowInstanceRepository["save"]>;
  };
  let workflowQuery: {
    findDefinitionById: jest.Mock;
    getInstanceFormSchema: jest.Mock;
    getVersionSnapshot: jest.Mock;
    countDefinitionsByTenant: jest.Mock;
    countPublishedDefinitionsByTenant: jest.Mock;
  };
  let publisher: {
    publishInstanceCreated: jest.MockedFunction<ExecutionPublisher["publishInstanceCreated"]>;
  };

  beforeEach(() => {
    mockGenerateUUID.mockReturnValue("event-1");
    instanceRepo = { create: jest.fn(), save: jest.fn() };
    workflowQuery = {
      findDefinitionById: jest.fn(),
      getInstanceFormSchema: jest.fn(),
      getVersionSnapshot: jest.fn(),
      countDefinitionsByTenant: jest.fn(),
      countPublishedDefinitionsByTenant: jest.fn(),
    };
    publisher = { publishInstanceCreated: jest.fn() };
    handler = new CreateInstanceHandler(
      instanceRepo as unknown as WorkflowInstanceRepository,
      workflowQuery as unknown as IWorkflowQueryContract,
      publisher as unknown as ExecutionPublisher
    );
  });

  it("throws NotFoundException when definition is missing", async () => {
    workflowQuery.findDefinitionById.mockResolvedValue(null);
    await expect(
      handler.execute(
        new CreateInstanceCommand(TEST_IDS.WORKFLOW_DEFINITION_ID, { leaveDays: 1 }, mockRequestorJwt)
      )
    ).rejects.toThrow(NotFoundException);
  });

  it("throws UnprocessableEntityException when required fields are missing", async () => {
    workflowQuery.findDefinitionById.mockResolvedValue(MockPublishedWorkflowDefinition);
    workflowQuery.getInstanceFormSchema.mockResolvedValue({
      fields: [{ key: "leaveDays", required: true }],
    });
    await expect(
      handler.execute(
        new CreateInstanceCommand(TEST_IDS.WORKFLOW_DEFINITION_ID, {}, mockRequestorJwt)
      )
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("creates and publishes instance when payload and snapshot are valid", async () => {
    workflowQuery.findDefinitionById.mockResolvedValue({
      ...MockPublishedWorkflowDefinition,
      currentVersion: 2,
    });
    workflowQuery.getInstanceFormSchema.mockResolvedValue({
      fields: [{ key: "leaveDays", required: true }],
    });
    workflowQuery.getVersionSnapshot.mockResolvedValue({
      states: [{ id: TEST_IDS.INITIAL_STATE_ID, name: "Draft", isInitial: true }],
      transitions: [],
    });

    instanceRepo.create.mockReturnValue({
      ...MockWorkflowInstance,
      status: WorkflowInstanceStatus.ACTIVE,
    });
    instanceRepo.save.mockResolvedValue(MockWorkflowInstance as never);

    const result = await handler.execute(
      new CreateInstanceCommand(
        TEST_IDS.WORKFLOW_DEFINITION_ID,
        { leaveDays: 2 },
        mockRequestorJwt
      )
    );

    expect(result).toEqual(MockWorkflowInstance);
    expect(instanceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
        definitionVersion: 1,
      })
    );
    expect(publisher.publishInstanceCreated).toHaveBeenCalledTimes(1);
  });

  it("throws when no initial state exists in snapshot", async () => {
    workflowQuery.findDefinitionById.mockResolvedValue({
      ...MockPublishedWorkflowDefinition,
      currentVersion: 2,
    });
    workflowQuery.getInstanceFormSchema.mockResolvedValue({ fields: [] });
    workflowQuery.getVersionSnapshot.mockResolvedValue({ states: [], transitions: [] });

    await expect(
      handler.execute(
        new CreateInstanceCommand(TEST_IDS.WORKFLOW_DEFINITION_ID, { ok: true }, mockRequestorJwt)
      )
    ).rejects.toThrow(AppErrors.WORKFLOW_INITIAL_STATE_REQUIRED);
  });
});

