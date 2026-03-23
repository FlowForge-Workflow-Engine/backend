import { TEST_IDS } from '../constants/uuid.constants';

/**
 * Canonical entity fixture objects for the tenant module.
 * These are plain-object snapshots — sufficient for unit tests.
 */

export const MockTenant = {
  id: TEST_IDS.TENANT_A_ID,
  name: 'Acme Corp',
  slug: 'acme-corp',
  plan: 'pro' as const,
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockTenantB = {
  id: TEST_IDS.TENANT_B_ID,
  name: 'Globex Corp',
  slug: 'globex-corp',
  plan: 'free' as const,
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockTenantSettings = {
  id: TEST_IDS.TENANT_SETTINGS_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  maxWorkflowDefinitions: 10,
  maxUsers: 50,
  branding: null as Record<string, unknown> | null,
  timezone: 'UTC',
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  tenant: MockTenant,
};

export const MockFeatureFlag = {
  id: TEST_IDS.FEATURE_FLAG_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  flagKey: 'advanced_reporting',
  isEnabled: true,
  config: null as Record<string, unknown> | null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockDisabledFeatureFlag = {
  id: TEST_IDS.FEATURE_FLAG_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  flagKey: 'beta_feature',
  isEnabled: false,
  config: null as Record<string, unknown> | null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

