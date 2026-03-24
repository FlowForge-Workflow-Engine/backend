/**
 * Canonical RlsContextService mock (libs/database).
 *
 * RlsContextService manages the PostgreSQL SET ROLE / SET app.tenant_id
 * lifecycle for every authenticated request. In unit tests all of these
 * side effects must be suppressed so the tests don't require a live DB connection.
 */
export const createMockRlsContextService = () => ({
  setTenantContext: jest.fn().mockResolvedValue(undefined),
  clearTenantContext: jest.fn().mockResolvedValue(undefined),
  setPublicContext: jest.fn().mockResolvedValue(undefined),
  getCurrentTenantContext: jest.fn().mockResolvedValue(null),
  withTenantContext: jest.fn((_tenantId: string, fn: () => unknown) => fn()),
  bypassRls: jest.fn((fn: () => unknown) => fn()),
});

export type MockRlsContextService = ReturnType<typeof createMockRlsContextService>;

