export const WORKFLOW_EXECUTION_QUERY_CONTRACT = Symbol("WORKFLOW_EXECUTION_QUERY_CONTRACT");

export interface IWorkflowExecutionQueryContract {
  /**
   * Count active workflow instances within a tenant.
   * Dashboard callers use this instead of reaching into execution repositories directly.
   * @param tenantId - UUID of the tenant
   * @returns Total number of active workflow instances for the tenant
   */
  countActiveInstancesByTenant(tenantId: string): Promise<number>;
}
