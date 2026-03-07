export const WORKFLOW_QUERY_CONTRACT = Symbol("WORKFLOW_QUERY_CONTRACT");

export interface WorkflowDefinitionSummary {
  readonly id: string;
  readonly name: string;
  readonly currentVersion: number;
  readonly status: string;
}

export interface WorkflowInstanceFormField {
  readonly key: string;
  readonly type: string;
  readonly label: string;
  readonly required: boolean;
}

export interface WorkflowInstanceFormSchema {
  readonly fields: WorkflowInstanceFormField[];
}

export interface IWorkflowQueryContract {
  /**
   * Find a workflow definition by ID within a tenant.
   * @param definitionId - UUID of the workflow definition
   * @param tenantId - UUID of the tenant
   * @returns WorkflowDefinitionSummary or null if not found
   */
  findDefinitionById(definitionId: string, tenantId: string): Promise<WorkflowDefinitionSummary | null>;

  /**
   * Count all workflow definitions within a tenant.
   * @param tenantId - UUID of the tenant
   * @returns Total number of workflow definitions owned by the tenant
   */
  countDefinitionsByTenant(tenantId: string): Promise<number>;

  /**
   * Count only published workflow definitions within a tenant.
   * This keeps dashboard callers from needing workflow-definition internals.
   * @param tenantId - UUID of the tenant
   * @returns Total number of published workflow definitions for the tenant
   */
  countPublishedDefinitionsByTenant(tenantId: string): Promise<number>;

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
    tenantId: string
  ): Promise<Record<string, unknown> | null>;

  /**
   * Get the definition-owned instance form schema.
   * Returns an empty fields array when no schema has been stored yet.
   * @param definitionId - UUID of the workflow definition
   * @param tenantId - UUID of the tenant
   */
  getInstanceFormSchema(definitionId: string, tenantId: string): Promise<WorkflowInstanceFormSchema>;
}
