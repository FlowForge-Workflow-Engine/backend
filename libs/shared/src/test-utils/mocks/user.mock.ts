import { TEST_IDS } from '../constants/uuid.constants';

/**
 * Canonical entity fixture objects for the auth module.
 * These are plain-object snapshots (not TypeORM instances) — sufficient for unit tests.
 *
 * MockRole / MockUser / MockUserRole use the canonical TENANT_A_ID + ADMIN_USER_ID IDs
 * so they match mockAdminJwt from jwt-payload.mock.ts.
 */

export const MockAdminRole = {
  id: TEST_IDS.ADMIN_ROLE_CANONICAL_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  name: 'Admin',
  description: 'Full system access',
  isSystemRole: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  userRoles: [] as unknown[],
};

export const MockApproverRole = {
  id: TEST_IDS.APPROVER_ROLE_CANONICAL_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  name: 'Approver',
  description: 'Can approve workflow transitions',
  isSystemRole: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  userRoles: [] as unknown[],
};

export const MockRequestorRole = {
  id: TEST_IDS.REQUESTOR_ROLE_CANONICAL_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  name: 'Requestor',
  description: 'Can submit workflow requests',
  isSystemRole: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  userRoles: [] as unknown[],
};

export const MockAdminUser = {
  id: TEST_IDS.ADMIN_USER_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  email: 'admin@acme.com',
  firstName: 'Jane',
  lastName: 'Doe',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$hashedpassword',
  isActive: true,
  isEmailVerified: true,
  lastLoginAt: new Date('2024-06-01T10:00:00Z'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  userRoles: [] as unknown[],
};

export const MockApproverUser = {
  id: TEST_IDS.APPROVER_USER_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  email: 'approver@acme.com',
  firstName: 'John',
  lastName: 'Smith',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$hashedpassword',
  isActive: true,
  isEmailVerified: true,
  lastLoginAt: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  userRoles: [] as unknown[],
};

export const MockRequestorUser = {
  id: TEST_IDS.REQUESTOR_USER_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  email: 'requestor@acme.com',
  firstName: 'Bob',
  lastName: 'Jones',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$hashedpassword',
  isActive: true,
  isEmailVerified: false,
  lastLoginAt: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  userRoles: [] as unknown[],
};

export const MockAdminUserRole = {
  userId: TEST_IDS.ADMIN_USER_ID,
  roleId: TEST_IDS.ADMIN_ROLE_CANONICAL_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  assignedBy: TEST_IDS.ADMIN_USER_ID,
  assignedAt: new Date('2024-01-01T00:00:00Z'),
  role: MockAdminRole,
  user: MockAdminUser,
};

