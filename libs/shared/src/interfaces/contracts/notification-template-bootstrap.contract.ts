export const NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT = Symbol("NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT");

export interface INotificationTemplateBootstrapContract {
  /**
   * Ensure the default tenant-created welcome email template exists before onboarding emits tenant.created.
   * This keeps the first welcome email fully event-driven without requiring manual template setup.
   *
   * @param tenantId - UUID of the tenant that just finished provisioning
   */
  ensureTenantCreatedWelcomeTemplate(tenantId: string): Promise<void>;
}