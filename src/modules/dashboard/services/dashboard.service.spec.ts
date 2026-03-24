/**
 * Unit Tests: DashboardService
 * Module: dashboard
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - USER_QUERY_CONTRACT: count users in tenant
 * - WORKFLOW_QUERY_CONTRACT: count workflow definitions (total + published)
 * - WORKFLOW_EXECUTION_QUERY_CONTRACT: count active workflow instances
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { DashboardService } from "./dashboard.service";
import { DashboardStatsResponseDto } from "../dto/dashboard-stats-response.dto";
import {
  IUserQueryContract,
  USER_QUERY_CONTRACT,
} from "@app/shared/interfaces/contracts/user-query.contract";
import {
  IWorkflowQueryContract,
  WORKFLOW_QUERY_CONTRACT,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import {
  IWorkflowExecutionQueryContract,
  WORKFLOW_EXECUTION_QUERY_CONTRACT,
} from "@app/shared/interfaces/contracts/workflow-execution-query.contract";

describe("DashboardService", () => {
  let service: DashboardService;

  let userQuery: jest.Mocked<IUserQueryContract>;
  let workflowQuery: jest.Mocked<IWorkflowQueryContract>;
  let workflowExecutionQuery: jest.Mocked<IWorkflowExecutionQueryContract>;

  const tenantId = "aaaaaaaa-0000-4000-8000-000000000001";

  beforeEach(async () => {
    userQuery = {
      countByTenant: jest.fn(),
      findById: jest.fn(),
      findManyByIds: jest.fn(),
      existsWithRole: jest.fn(),
    };

    workflowQuery = {
      countDefinitionsByTenant: jest.fn(),
      countPublishedDefinitionsByTenant: jest.fn(),
      findDefinitionById: jest.fn(),
      getVersionSnapshot: jest.fn(),
      getInstanceFormSchema: jest.fn(),
    };

    workflowExecutionQuery = {
      countActiveInstancesByTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: USER_QUERY_CONTRACT, useValue: userQuery },
        { provide: WORKFLOW_QUERY_CONTRACT, useValue: workflowQuery },
        { provide: WORKFLOW_EXECUTION_QUERY_CONTRACT, useValue: workflowExecutionQuery },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  it("should compose stats from all 4 contract counts", async () => {
    userQuery.countByTenant.mockResolvedValue(42);
    workflowQuery.countDefinitionsByTenant.mockResolvedValue(12);
    workflowQuery.countPublishedDefinitionsByTenant.mockResolvedValue(7);
    workflowExecutionQuery.countActiveInstancesByTenant.mockResolvedValue(19);

    const result = await service.getStats(tenantId);

    expect(result).toEqual<DashboardStatsResponseDto>({
      totalWorkflows: 12,
      publishedWorkflows: 7,
      activeInstances: 19,
      totalUsers: 42,
    });

    expect(workflowQuery.countDefinitionsByTenant).toHaveBeenCalledWith(tenantId);
    expect(workflowQuery.countPublishedDefinitionsByTenant).toHaveBeenCalledWith(tenantId);
    expect(workflowExecutionQuery.countActiveInstancesByTenant).toHaveBeenCalledWith(tenantId);
    expect(userQuery.countByTenant).toHaveBeenCalledWith(tenantId);
  });

  it("should propagate errors from contract reads", async () => {
    const err = new Error("contract failure");

    workflowQuery.countDefinitionsByTenant.mockRejectedValue(err);
    workflowQuery.countPublishedDefinitionsByTenant.mockResolvedValue(7);
    workflowExecutionQuery.countActiveInstancesByTenant.mockResolvedValue(19);
    userQuery.countByTenant.mockResolvedValue(42);

    await expect(service.getStats(tenantId)).rejects.toThrow("contract failure");
  });
});

