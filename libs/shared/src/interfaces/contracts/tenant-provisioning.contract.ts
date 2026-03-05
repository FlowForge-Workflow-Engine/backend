export const TENANT_PROVISIONING_CONTRACT = Symbol("TENANT_PROVISIONING_CONTRACT");

export interface TenantProvisioningResult {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly plan: string;
}

export interface ITenantProvisioningContract {
  /**
   * Atomically create a new Tenant + TenantSettings with default values.
   * Throws ConflictException if the slug is already taken.
   *
   * @param dto - tenant name, slug, and optional plan (defaults to 'free')
   * @returns TenantProvisioningResult with the newly created tenant's details
   */
  provision(dto: { name: string; slug: string; plan?: string }): Promise<TenantProvisioningResult>;
}
