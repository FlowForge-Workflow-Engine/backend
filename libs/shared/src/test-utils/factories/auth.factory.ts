import { TEST_IDS } from "../constants/uuid.constants";

/**
 * Minimal plain-object factories for auth entities.
 * Returns typed plain objects that satisfy the entity shapes used in tests.
 * Import entity types from the auth module directly in spec files.
 */

export function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_IDS.USER_ID,
    tenantId: TEST_IDS.TENANT_ID,
    email: "alice@acme.com",
    firstName: "Alice",
    lastName: "Smith",
    passwordHash: "$argon2id$test$hash",
    isActive: true,
    isEmailVerified: false,
    lastLoginAt: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    userRoles: [],
    ...overrides,
  };
}

export function makeRole(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_IDS.ADMIN_ROLE_ID,
    tenantId: TEST_IDS.TENANT_ID,
    name: "Admin",
    description: "Full access",
    isSystemRole: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    userRoles: [],
    ...overrides,
  };
}

export function makeUserRole(overrides: Record<string, unknown> = {}) {
  const role = makeRole(overrides.role as Record<string, unknown>);
  return {
    userId: TEST_IDS.USER_ID,
    roleId: TEST_IDS.ADMIN_ROLE_ID,
    tenantId: TEST_IDS.TENANT_ID,
    assignedBy: TEST_IDS.ACTOR_ID,
    assignedAt: new Date("2024-01-01T00:00:00Z"),
    role,
    user: makeUser(),
    ...overrides,
  };
}

export function makeRefreshToken(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_IDS.REFRESH_TOKEN_ID,
    tenantId: TEST_IDS.TENANT_ID,
    userId: TEST_IDS.USER_ID,
    tokenHash: "sha256-hash-of-raw-token",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function makeTenantSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_IDS.TENANT_ID,
    name: TEST_IDS.TENANT_NAME,
    slug: TEST_IDS.TENANT_SLUG,
    plan: TEST_IDS.TENANT_PLAN,
    isActive: true,
    ...overrides,
  };
}

export function makeJwtPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: TEST_IDS.USER_ID,
    email: "alice@acme.com",
    firstName: "Alice",
    tenantId: TEST_IDS.TENANT_ID,
    tenantSlug: TEST_IDS.TENANT_SLUG,
    roles: ["Admin"],
    roleIds: [TEST_IDS.ADMIN_ROLE_ID],
    plan: TEST_IDS.TENANT_PLAN,
    ...overrides,
  };
}

