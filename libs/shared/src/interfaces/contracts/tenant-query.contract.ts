export const TENANT_QUERY_CONTRACT = Symbol("TENANT_QUERY_CONTRACT");

export interface TenantSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly plan: string;
  readonly isActive: boolean;
}

export interface ITenantQueryContract {
  /**
   * Find a tenant by its ID.
   * @param tenantId - UUID of the tenant
   * @returns TenantSummary or null if not found
   */
  findById(tenantId: string): Promise<TenantSummary | null>;

  /**
   * Check if a feature flag is enabled for a tenant.
   * @param tenantId - UUID of the tenant
   * @param flagKey - Feature flag key (e.g. 'enable_webhooks')
   * @returns true if feature is enabled
   */
  isFeatureEnabled(tenantId: string, flagKey: string): Promise<boolean>;

  /**
   * Get the plan for a tenant.
   * @param tenantId - UUID of the tenant
   * @returns plan string (e.g. 'free', 'pro', 'enterprise')
   */
  getPlan(tenantId: string): Promise<string>;
}

