import { Inject, Injectable } from "@nestjs/common";
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
import { DashboardStatsResponseDto } from "../dto/dashboard-stats-response.dto";

/**
 * Composes tenant-scoped dashboard data from read-only contracts exported by other modules.
 * This keeps the dashboard as a presentation-layer aggregator instead of a new domain owner.
 */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(USER_QUERY_CONTRACT)
    private readonly userQuery: IUserQueryContract,
    @Inject(WORKFLOW_QUERY_CONTRACT)
    private readonly workflowQuery: IWorkflowQueryContract,
    @Inject(WORKFLOW_EXECUTION_QUERY_CONTRACT)
    private readonly workflowExecutionQuery: IWorkflowExecutionQueryContract
  ) {}

  async getStats(tenantId: string): Promise<DashboardStatsResponseDto> {
    // These reads are independent, so execute them in parallel and return one compact payload to the UI.
    const [totalWorkflows, publishedWorkflows, activeInstances, totalUsers] = await Promise.all([
      this.workflowQuery.countDefinitionsByTenant(tenantId),
      this.workflowQuery.countPublishedDefinitionsByTenant(tenantId),
      this.workflowExecutionQuery.countActiveInstancesByTenant(tenantId),
      this.userQuery.countByTenant(tenantId),
    ]);

    return {
      totalWorkflows,
      publishedWorkflows,
      activeInstances,
      totalUsers,
    };
  }
}
