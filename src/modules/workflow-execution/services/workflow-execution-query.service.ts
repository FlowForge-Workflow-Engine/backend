import { Injectable } from "@nestjs/common";
import { IWorkflowExecutionQueryContract } from "@app/shared/interfaces/contracts/workflow-execution-query.contract";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";

/**
 * Read-only facade exported from WorkflowExecutionModule for synchronous cross-module queries.
 * Keeps dashboard-style reads on the contract boundary instead of exposing repositories.
 */
@Injectable()
export class WorkflowExecutionQueryService implements IWorkflowExecutionQueryContract {
  constructor(private readonly workflowInstanceRepository: WorkflowInstanceRepository) {}

  /**
   * Counts only active instances because that is the dashboard card required by the product UI.
   *
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<number> - Active workflow instance count
   */
  async countActiveInstancesByTenant(tenantId: string): Promise<number> {
    return this.workflowInstanceRepository.countByTenant(tenantId, {
      status: WorkflowInstanceStatus.ACTIVE,
    });
  }
}
