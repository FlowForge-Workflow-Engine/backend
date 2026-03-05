export const WORKFLOW_QUERY_CONTRACT = Symbol("WORKFLOW_QUERY_CONTRACT");

export interface WorkflowDefinitionSummary {
  readonly id: string;
  readonly name: string;
  readonly currentVersion: number;
  readonly status: string;
}

export interface IWorkflowQueryContract {
  /**
   * Find a workflow definition by ID within a tenant.
   * @param definitionId - UUID of the workflow definition
   * @param tenantId - UUID of the tenant
   * @returns WorkflowDefinitionSummary or null if not found
   */
  findDefinitionById(
    definitionId: string,
    tenantId: string,
  ): Promise<WorkflowDefinitionSummary | null>;

  /**
   * Get a version snapshot of a workflow definition.
   * @param definitionId - UUID of the workflow definition
   * @param version - Version number
   * @param tenantId - UUID of the tenant
   * @returns JSONB snapshot record or null if not found
   */
  getVersionSnapshot(
    definitionId: string,
    version: number,
    tenantId: string,
  ): Promise<Record<string, unknown> | null>;
}

