---
title: Security Design Documentation
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# Security Design Documentation

This document provides a complete security architecture specification covering threat modelling, authentication and authorization design, multi-tenant isolation, rate limiting, input validation, data security, secret management, audit strategy, and HTTP hardening. It draws directly from the implemented source code, migration files, and strategy documents embedded in the codebase.

---

## Table of Contents

- [1. Security Overview & Threat Model](#1-security-overview--threat-model)
  - [1.1 Assets to Protect](#11-assets-to-protect)
  - [1.2 Threat Actors](#12-threat-actors)
  - [1.3 Key Threat Scenarios](#13-key-threat-scenarios)
- [2. Authentication](#2-authentication)
  - [2.1 JWT Design](#21-jwt-design)
  - [2.2 Argon2 Password Hashing — Why Not Bcrypt?](#22-argon2-password-hashing--why-not-bcrypt)
  - [2.3 Token Lifecycle (Issuance, Refresh, Revocation)](#23-token-lifecycle-issuance-refresh-revocation)
  - [2.4 Session Management](#24-session-management)
- [3. Authorization](#3-authorization)
  - [3.1 RBAC Model](#31-rbac-model)
  - [3.2 NestJS Guards Implementation](#32-nestjs-guards-implementation)
  - [3.3 Decorator-Based Access Control](#33-decorator-based-access-control)
- [4. Tenant Isolation](#4-tenant-isolation)
  - [4.1 Multi-Tenancy Architecture](#41-multi-tenancy-architecture)
  - [4.2 Row-Level Security (PostgreSQL RLS)](#42-row-level-security-postgresql-rls)
  - [4.3 Tenant Context Propagation](#43-tenant-context-propagation)
  - [4.4 Cross-Tenant Attack Prevention](#44-cross-tenant-attack-prevention)
- [5. Rate Limiting & Abuse Prevention](#5-rate-limiting--abuse-prevention)
  - [5.1 Per-Tenant Rate Limiting](#51-per-tenant-rate-limiting)
  - [5.2 IP-Based / Global Rate Limiting](#52-ip-based--global-rate-limiting)
  - [5.3 DDoS Considerations](#53-ddos-considerations)
- [6. Input Validation & Sanitization](#6-input-validation--sanitization)
  - [6.1 DTO Validation (class-validator)](#61-dto-validation-class-validator)
  - [6.2 SQL Injection Prevention](#62-sql-injection-prevention)
  - [6.3 XSS Prevention](#63-xss-prevention)
  - [6.4 CSRF Protection](#64-csrf-protection)
- [7. Data Security](#7-data-security)
  - [7.1 Encryption at Rest](#71-encryption-at-rest)
  - [7.2 Encryption in Transit (TLS)](#72-encryption-in-transit-tls)
  - [7.3 Sensitive Field Handling](#73-sensitive-field-handling)
  - [7.4 PII Considerations](#74-pii-considerations)
- [8. Secret Management](#8-secret-management)
  - [8.1 Environment Variable Strategy](#81-environment-variable-strategy)
  - [8.2 Secret Rotation Policy (Conceptual)](#82-secret-rotation-policy-conceptual)
- [9. Audit & Monitoring](#9-audit--monitoring)
  - [9.1 Audit Module Design](#91-audit-module-design)
  - [9.2 Audit Event Catalogue](#92-audit-event-catalogue)
  - [9.3 Security Monitoring Strategy](#93-security-monitoring-strategy)
- [10. Security Headers & HTTP Hardening](#10-security-headers--http-hardening)
- [11. Dependency Security](#11-dependency-security)

---

## 1. Security Overview & Threat Model

The security architecture is built on a **defence-in-depth** model with at least three independent controls at each layer. No single control failure can result in cross-tenant data exposure or privilege escalation. Controls are applied at: the network edge (TLS, CORS), the HTTP middleware layer (Helmet, CSRF, HPP, XSS-clean), the application layer (JWT guards, RBAC, rate limiting), and the database layer (PostgreSQL RLS).

### 1.1 Assets to Protect

| Asset                                                     | Sensitivity                        | Location                                             | Owner             |
| --------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- | ----------------- |
| Tenant workflow data (instances, payloads)                | High                               | PostgreSQL `workflow_instances.payload` JSONB        | Tenant            |
| User credentials (passwords)                              | Critical                           | `users.password_hash` (Argon2id hash)                | Tenant            |
| JWT signing secret                                        | Critical                           | Environment variable `JWT_SECRET`                    | Platform          |
| Refresh tokens                                            | High                               | `refresh_tokens.token_hash` (SHA-256 hash)           | Platform          |
| Webhook signing secrets                                   | High                               | `webhook_configs.secret`                             | Tenant            |
| Audit log history                                         | High — immutable compliance record | `audit_logs`                                         | Platform + Tenant |
| Workflow definition logic (rules, transitions)            | Medium                             | `workflow_definition_versions.snapshot` JSONB        | Tenant            |
| User PII (email, name)                                    | Medium                             | `users.email`, `users.first_name`, `users.last_name` | Tenant            |
| Tenant plan and feature configuration                     | Medium                             | `tenants.plan`, `tenant_feature_flags`               | Platform          |
| Infrastructure secrets (DB password, Redis URL, NATS URL) | Critical                           | Environment variables                                | Platform          |

### 1.2 Threat Actors

| Actor                                      | Capability                                         | Goal                                                         |
| ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------ |
| Unauthenticated external attacker          | Internet access; can craft arbitrary HTTP requests | Extract data, disrupt service, brute-force credentials       |
| Authenticated tenant user (low privilege)  | Valid JWT with limited roles                       | Escalate to higher roles; access other tenants' data         |
| Authenticated tenant user (high privilege) | Valid JWT with Admin role                          | Exceed tenant boundary; access platform metadata             |
| Compromised application process            | Code execution in the app container                | Exfiltrate DB credentials; bypass application controls       |
| Rogue database user                        | Direct PostgreSQL connection                       | Read cross-tenant rows; modify audit logs                    |
| Malicious tenant admin                     | Admin role within own tenant                       | Craft payloads to abuse rule engine; enumerate other tenants |
| Insider / developer with staging access    | DB read access                                     | Read production data if environments not isolated            |

### 1.3 Key Threat Scenarios

**T1 — Cross-Tenant Data Access:** A user from Tenant A obtains or guesses a `tenantId` from Tenant B and includes it in a forged request. Mitigated by: JWT-embedded `tenantId` (cannot be changed without token re-issuance), `TenantIsolationGuard` (validates JWT claim), and PostgreSQL RLS (database-level enforcement independent of application code).

**T2 — JWT Token Theft:** An attacker captures a valid access token. Mitigated by: 15-minute access token expiry limits the window; `HttpOnly` refresh token cookie prevents JavaScript access; token rotation on every refresh invalidates stolen refresh tokens.

**T3 — Brute Force / Credential Stuffing:** Automated attempts against `POST /auth/login`. Mitigated by: Argon2id password hashing (high cost per attempt), `EnhancedRateLimitMiddleware` (200 burst / 120 rpm per user bucket), `ThrottlerGuard` (global backup), and undifferentiated error messages (`Invalid credentials` regardless of whether user exists).

**T4 — SQL Injection:** Malicious input in query parameters or request body targeting database queries. Mitigated by: TypeORM parameterized queries (all values bound as `$N` parameters), PostgreSQL RLS (even injected `1=1` conditions are AND-ed with the tenant context), and `ValidationPipe` (strict DTO validation rejects unexpected fields).

**T5 — CSRF Attack:** An attacker crafts a malicious form on a third-party site that executes a state-changing request on behalf of an authenticated user. Mitigated by: `csurf` middleware requiring an `X-CSRF-Token` header on all mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) in non-dev environments; CORS allowlist restricts `Origin` to known frontend origins.

**T6 — Audit Log Tampering:** A compromised application process attempts to delete or modify audit records. Mitigated by: PostgreSQL trigger installed in migration `1772830604496` that raises an exception on any `UPDATE` or `DELETE` on `audit_logs`; immutability is enforced at the database level regardless of application code.

**T7 — Noisy Neighbour / DoS Against One Tenant:** A tenant with a high-volume use case starves other tenants' API capacity. Mitigated by: per-tenant leaky-bucket rate limiting with fully isolated Redis buckets; each tenant's burst capacity (1,000) and sustained rate (600 rpm) are enforced independently.

---

## 2. Authentication

### 2.1 JWT Design

The system uses **HS256-signed JWTs** for access tokens, issued by `AuthService.issueTokenPair()` and validated by `JwtStrategy` (a Passport JWT strategy). The token is carried as a standard `Authorization: Bearer <token>` header on every authenticated request.

**JWT Payload Structure:**

```typescript
// libs/shared/src/interfaces/jwt-payload.interface.ts
interface IJwtPayload {
  sub: string; // User UUID — primary identity key
  email: string; // Snapshot of email at login time
  firstName: string; // Snapshot of first name
  tenantId: string; // Tenant UUID — primary isolation key
  tenantSlug: string; // Human-readable tenant identifier
  roles: string[]; // Role names e.g. ['Admin', 'Approver']
  roleIds: string[]; // Role UUIDs — used in transition role checks
  plan: string; // Tenant plan tier: 'free' | 'pro' | 'enterprise'
}
```

**Design choices:**

- `tenantId` in the payload eliminates every DB call for tenant resolution on protected routes. It is validated by `TenantIsolationGuard` and used by `DatabaseContextInterceptor` to set the RLS context.
- `roleIds` are embedded directly because transition role checks (`allowedRoleIds.some(rid => actor.roleIds.includes(rid))`) require UUID comparison, not name comparison. Storing IDs avoids a database round-trip on every transition attempt.
- `plan` is embedded because plan-gating logic (enforced at service layer) needs it without a cross-module contract call on every request.
- Access tokens are short-lived (**15 minutes** by default, configurable via `JWT_EXPIRY` env var). This limits the damage window if a token is captured in a log or proxy.
- The JWT secret is loaded from `JWT_SECRET` environment variable, validated at startup by `envSchema` (Joi schema in `libs/shared`), and never logged.

**Swagger is disabled in production.** The `DocumentBuilder` block is wrapped in `if (!['"prod"', '"production"'].includes(stage))`, preventing the Bearer auth token input from being exposed in production environments.

### 2.2 Argon2 Password Hashing — Why Not Bcrypt?

All passwords are hashed using **Argon2id** via the `argon2` npm package (`^0.44.0`). The utility functions `argon2hash()` and `argon2verify()` are defined in `libs/shared/src/utils/hashes/argon2.ts`.

**Why Argon2id over bcrypt:**

Bcrypt was designed in 1999 and is CPU-bound by design. Argon2id (winner of the 2015 Password Hashing Competition) is both memory-hard and CPU-hard. Memory hardness is the key property: an attacker attempting GPU-accelerated brute force must allocate significant RAM per attempt, which limits the number of parallel cracking threads on commodity hardware. Argon2id specifically combines Argon2i (data-independent memory access, resistant to side-channel attacks) and Argon2d (data-dependent memory access, maximally resistant to GPU attacks) — making it the recommended choice for password databases according to OWASP.

In practical terms, an attacker with a modern GPU can test ~10 billion bcrypt hashes per second at cost factor 10, but only ~1,000–10,000 Argon2id hashes per second at the library defaults due to memory bandwidth constraints.

**Credential comparison security:** `argon2verify()` performs a constant-time comparison. The same `UnauthorizedException('Invalid credentials')` is thrown whether the user does not exist, is inactive, or provided a wrong password — preventing user enumeration via response timing or message differentiation.

### 2.3 Token Lifecycle (Issuance, Refresh, Revocation)

**Issuance (`issueTokenPair`):**

```
1. JwtService.sign(IJwtPayload) → signed access token (15-min expiry)
2. generateUUID() → raw refresh token (opaque UUID v4)
3. sha256(rawRefreshToken) → tokenHash
4. RefreshTokenRepository.create({ tenantId, userId, tokenHash, expiresAt: now + 7d })
5. Return { accessToken, refreshToken: rawUUID }
```

Only the SHA-256 hash is persisted. The raw refresh token is sent to the client and never stored — a database breach does not expose usable refresh tokens.

**Refresh (`AuthService.refresh`):**

```
1. sha256(rawRefreshToken) → tokenHash
2. RefreshTokenRepository.findByHash(tokenHash) → stored
3. Validate: stored exists AND stored.expiresAt > now AND stored.revokedAt IS NULL
4. RefreshTokenRepository.revoke(stored.id)   ← ROTATION: consume old token
5. UserRepository.findByIdWithRoles(...)       ← re-read roles (may have changed)
6. TenantQuery.findById(tenantId)              ← re-read plan (may have changed)
7. issueTokenPair(...)                         ← issue fresh pair
```

Token rotation means each refresh operation generates a new refresh token and immediately revokes the old one. If a stolen refresh token is replayed after the legitimate client has already used it, the stored hash will have `revokedAt` set — the replay attempt fails with `401 Unauthorized`.

**Revocation (`AuthService.logout`):**

```
1. sha256(rawRefreshToken) → tokenHash
2. RefreshTokenRepository.findByHash(tokenHash)
3. If found AND not already revoked: RefreshTokenRepository.revoke(stored.id)
   → sets revoked_at = NOW()
```

Logout gracefully handles double-logout (token already revoked) without error. There is no server-side session to destroy for the access token — its short 15-minute expiry is the revocation mechanism.

**Refresh token storage schema:**

```
refresh_tokens
├── id          UUID PK
├── tenant_id   UUID (RLS-protected)
├── user_id     UUID (indexed)
├── token_hash  VARCHAR(255) UNIQUE — SHA-256 of raw token
├── expires_at  TIMESTAMPTZ
├── revoked_at  TIMESTAMPTZ nullable — NULL = active
└── created_at  TIMESTAMPTZ
```

The `UNIQUE` constraint on `token_hash` enables O(1) lookup by hash and prevents duplicate token insertion under concurrent conditions.

### 2.4 Session Management

The system is **stateless at the application layer** — there is no server-side session store. Each HTTP request must carry a valid JWT. This enables horizontal scaling without sticky sessions or shared session storage.

The only server-side state related to authentication is the `refresh_tokens` table in PostgreSQL (persisted, replicated) and the CSRF secret cookie (stored in an `HttpOnly` cookie on the client).

**Cookie configuration for CSRF secret:**

```typescript
csurf({
  cookie: {
    httpOnly: true, // inaccessible to JavaScript
    secure: isHostedEnvironment, // HTTPS-only in UAT/prod
    sameSite: isHostedEnvironment ? "none" : "lax",
    // SameSite=None required for cross-site browser requests (Vercel frontend → hosted backend)
  },
});
```

The `SameSite=None; Secure` setting is required specifically for cross-origin deployments (e.g., a Vercel-hosted frontend calling an API on a different domain). In local development, `SameSite=Lax` is sufficient and `Secure` is disabled.

---

## 3. Authorization

### 3.1 RBAC Model

The system implements a **tenant-scoped RBAC model** with three levels: Roles, Permissions, and Workflow-Level Role Constraints.

**Database tables:**

```
roles           — Tenant-scoped role definitions (name, isSystemRole)
permissions     — Global permission atoms (resource, action) — no tenant_id
user_roles      — Join table: (userId, roleId, tenantId, assignedBy, assignedAt)
```

**Default roles** provisioned for every new tenant by `TenantProvisioningService`:

| Role       | Typical Capabilities                                                 |
| ---------- | -------------------------------------------------------------------- |
| `Admin`    | Full tenant management: users, roles, workflow definitions, settings |
| `Manager`  | Create/publish workflow definitions; manage instances                |
| `Approver` | Execute transitions on instances assigned to this role               |
| `Viewer`   | Read-only access to instances and definitions                        |
| `Member`   | Create instances; view own instances                                 |

Roles are `isSystemRole = true` for the defaults, meaning they cannot be deleted via the API.

**Workflow-Level Role Constraints:** Beyond global RBAC, each workflow `transition` stores an `allowedRoleIds` UUID array. When `ExecuteTransitionHandler` runs step 5 of its 11-step pipeline, it checks `transition.allowedRoleIds.some(rid => actor.roleIds.includes(rid))`. An empty `allowedRoleIds` array means the transition is open to any authenticated user. This provides **per-transition RBAC** — finer-grained than the global role system — without any additional table lookups because `roleIds` are embedded in the JWT payload.

### 3.2 NestJS Guards Implementation

Four guards are registered globally in `AppModule` as `APP_GUARD` providers. They execute in declaration order on every HTTP request:

```typescript
// src/app.module.ts — provider order determines execution order
{ provide: APP_GUARD, useClass: ThrottlerGuard },         // 1st: rate limit check
{ provide: APP_GUARD, useClass: JwtAuthGuard },           // 2nd: token validation
{ provide: APP_GUARD, useClass: TenantIsolationGuard },   // 3rd: tenant check
{ provide: APP_GUARD, useClass: RolesGuard },             // 4th: role check
```

**JwtAuthGuard** (`libs/shared/src/guards/jwt-auth.guard.ts`):

Extends NestJS `AuthGuard('jwt')`. Before invoking the Passport JWT strategy, it checks the `IS_PUBLIC_KEY` metadata via `Reflector.getAllAndOverride()`. If `@Public()` is on the route handler or its controller, the guard returns `true` immediately without validating the token. On validation success, Passport populates `req.user` as `IJwtPayload`.

**TenantIsolationGuard** (`libs/shared/src/guards/tenant-isolation.guard.ts`):

Reads `req.user.tenantId` (set by `JwtAuthGuard`). Skips `@Public()` routes. Throws `UnauthorizedException('TENANT_MISMATCH')` if `tenantId` is absent or empty — this would indicate a JWT issued without a tenant context, which should never happen for regular users. Attaches `req.tenantId` as a convenience shortcut for downstream handlers.

**RolesGuard** (`libs/shared/src/guards/roles.guard.ts`):

Reads `ROLES_KEY` metadata set by `@Roles(...roleNames)`. If no `@Roles()` decorator is present on the route, any authenticated user passes. If roles are specified, checks `req.user.roles.some(r => requiredRoles.includes(r))`. Throws `ForbiddenException('FORBIDDEN')` on denial. Note: this guard uses role **names** (strings from the JWT `roles` array), while transition-level checks use role **IDs** (`roleIds`).

**Guard execution matrix:**

| Route Type                   | ThrottlerGuard | JwtAuthGuard | TenantIsolationGuard | RolesGuard  |
| ---------------------------- | -------------- | ------------ | -------------------- | ----------- |
| `@Public()`                  | Enforce        | Skip         | Skip                 | Skip        |
| Authenticated, no `@Roles()` | Enforce        | Validate     | Validate             | Pass all    |
| `@Roles('Admin')`            | Enforce        | Validate     | Validate             | Check Admin |
| Health endpoints             | Excluded       | Skip         | Skip                 | Skip        |

Health endpoints (`/health`, `/health/ready`) are both `@Public()` and excluded from `EnhancedRateLimitMiddleware` via the `consumer.apply(...).exclude(...)` configuration.

### 3.3 Decorator-Based Access Control

Three custom decorators in `libs/shared/src/decorators/` implement declarative access control at the route level:

**`@Public()`** — Marks a route as authentication-exempt. Sets `IS_PUBLIC_KEY = true` metadata. Both `JwtAuthGuard` and `TenantIsolationGuard` check this key and short-circuit. Used on: `POST /auth/login`, `POST /auth/register`, `POST /auth/register/tenant`, `GET /health`, `GET /health/ready`, `GET /auth/csrf-token`.

**`@Roles(...roles)`** — Sets `ROLES_KEY = roles[]` metadata. Read exclusively by `RolesGuard`. Example:

```typescript
@Get('admin-dashboard')
@Roles('Admin', 'Manager')
async getDashboard(@CurrentUser() user: IJwtPayload) { ... }
```

**`@CurrentUser()`** — Parameter decorator; extracts `req.user` as `IJwtPayload` with TypeScript typing. This is a pure accessor — zero database calls. All downstream authorization decisions that read from the JWT payload (roles, tenantId, plan) use this decorator as the entry point.

---

## 4. Tenant Isolation

### 4.1 Multi-Tenancy Architecture

The system uses a **shared database, shared schema** multi-tenancy model. All tenants share the same PostgreSQL instance and the same set of tables. Tenant isolation is achieved through two independent mechanisms applied at different architectural layers:

**Application layer:** Every repository query includes `WHERE tenant_id = :tenantId` clauses derived from the JWT. The `TenantIsolationGuard` ensures `tenantId` is always present in the request context before any controller code executes.

**Database layer:** PostgreSQL Row-Level Security (RLS) policies automatically append `AND tenant_id = current_setting('app.tenant_id')::uuid` to every query on tenant-scoped tables. This is an independent, database-enforced control that operates even if application code omits the tenant filter.

The dual-layer approach means that a bug in the application layer (missing `WHERE tenant_id`) is caught by the database layer, and a hypothetical bypass of the database layer (direct DB connection) still encounters the RLS policies.

### 4.2 Row-Level Security (PostgreSQL RLS)

#### Architecture Components

The RLS system is composed of four collaborating components:

**Migration `1772830604496-Create-RLS-Policies.ts`** — Runs once at application startup via `runMigrations()`. For each of the 19 tenant-scoped tables it executes three SQL statements in sequence:

```sql
-- Step 1: Enable RLS
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;

-- Step 2: Create isolation policy
CREATE POLICY {table}_tenant_isolation ON {table}
  FOR ALL
  USING (tenant_id = (current_setting('app.tenant_id'))::uuid);

-- Step 3: Force RLS (deny-all default)
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
```

`FORCE ROW LEVEL SECURITY` is the critical clause: it applies the policy even to the table owner (the application's database user). Without `FORCE`, the table owner bypasses RLS by default. With it, if `app.tenant_id` is not set (returns an empty string), the cast to `::uuid` raises an exception and the query fails — this is the **fail-secure default**.

**`RlsContextService`** (`src/modules/database/services/rls-context.service.ts`) — Thin service wrapping the PostgreSQL `set_config` / `current_setting` functions:

```typescript
async setTenantContext(tenantId: string): Promise<void> {
  await queryRunner.query(
    "SELECT set_config('app.tenant_id', $1::text, true)",
    [tenantId]
  );
  // Third arg = true → local to current transaction
}

async clearTenantContext(): Promise<void> {
  await queryRunner.query(
    "SELECT set_config('app.tenant_id', '', true)"
  );
}

async bypassRls<T>(fn: () => Promise<T>): Promise<T> {
  // Used for system-admin cross-tenant operations
  // Logs a WARN before execution
}
```

The `true` parameter in `set_config` scopes the variable to the current transaction, preventing context bleed across connection-pool reuse.

**`DatabaseContextInterceptor`** (`src/modules/database/interceptors/database-context.interceptor.ts`) — Registered globally as `APP_INTERCEPTOR`. Executes in the interceptor pipeline after `TenantContextInterceptor`:

```typescript
intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
  const request = context.switchToHttp().getRequest();
  const tenantId = request.user?.tenantId;

  if (tenantId) {
    await this.rlsContextService.setTenantContext(tenantId);
  }

  return next.handle().pipe(
    tap(() => this.rlsContextService.clearTenantContext())
  );
}
```

The `tap()` clears the tenant context after the response is sent, ensuring no tenant context leaks to the next request served by the same connection-pool connection.

#### Request Flow with RLS Active

```
1. HTTP Request arrives with JWT
   → JwtAuthGuard: validates token → populates req.user = IJwtPayload

2. TenantIsolationGuard
   → validates req.user.tenantId present → attaches req.tenantId

3. DatabaseContextInterceptor
   → rlsContextService.setTenantContext(req.user.tenantId)
   → SQL: SELECT set_config('app.tenant_id', '{tenantId}', true)

4. Controller / Service / Repository
   → Developer writes: SELECT * FROM users WHERE id = $1
   → PostgreSQL transparently applies RLS:
      SELECT * FROM users
      WHERE id = $1
        AND tenant_id = (current_setting('app.tenant_id'))::uuid

5. Response sent
   → tap() fires: rlsContextService.clearTenantContext()
```

#### Security Scenarios

**Scenario A — Normal operation:** JWT `tenantId = 'tenant-a-uuid'`. RLS context = `tenant-a-uuid`. Query returns only tenant A's rows. ✅

**Scenario B — Malicious cross-tenant request:** Attacker's JWT has `tenantId = 'tenant-a-uuid'` (cannot forge without `JWT_SECRET`). Even if attacker constructs a request with `id` pointing to tenant B's resource: RLS adds `AND tenant_id = 'tenant-a-uuid'` — zero rows returned. ✅

**Scenario C — Developer forgets tenant filter:**

```typescript
// Bug: developer writes a query without explicit tenantId
async getAllUsers() {
  return this.userRepository.find();  // No WHERE tenant_id!
}
// RLS adds: WHERE tenant_id = 'current-tenant-uuid' automatically
// Only current tenant's data returned. ✅
```

**Scenario D — SQL injection bypass attempt:**

```
Injected: "'; SELECT * FROM users WHERE '1'='1"
RLS policy: AND tenant_id = current_context_tenant_id
Result: Even if injection bypasses WHERE clauses, RLS policy is evaluated at the
        PostgreSQL policy layer — not part of the query text.
        Attacker receives only data belonging to their own tenant. ✅
```

#### RLS Policy Catalogue

| Policy Name                                     | Table                          | Rule                                                  | Effect                                          |
| ----------------------------------------------- | ------------------------------ | ----------------------------------------------------- | ----------------------------------------------- |
| `users_tenant_isolation`                        | `users`                        | `tenant_id = current_setting('app.tenant_id')::uuid`  | Restricts all operations to current tenant      |
| `roles_tenant_isolation`                        | `roles`                        | `tenant_id = current_setting(...)::uuid`              | Tenant-scoped role management                   |
| `user_roles_tenant_isolation`                   | `user_roles`                   | Subquery via `users.tenant_id` (FK join on `user_id`) | Role assignments scoped by owning user's tenant |
| `refresh_tokens_tenant_isolation`               | `refresh_tokens`               | `tenant_id = current_setting(...)::uuid`              | Tokens only readable/writable by owning tenant  |
| `tenant_settings_tenant_isolation`              | `tenant_settings`              | `tenant_id = current_setting(...)::uuid`              | Settings isolated per tenant                    |
| `tenant_feature_flags_tenant_isolation`         | `tenant_feature_flags`         | `tenant_id = current_setting(...)::uuid`              | Feature toggles isolated per tenant             |
| `workflow_definitions_tenant_isolation`         | `workflow_definitions`         | `tenant_id = current_setting(...)::uuid`              | Definitions isolated per tenant                 |
| `workflow_definition_versions_tenant_isolation` | `workflow_definition_versions` | `tenant_id = current_setting(...)::uuid`              | Version snapshots isolated                      |
| `workflow_states_tenant_isolation`              | `workflow_states`              | `tenant_id = current_setting(...)::uuid`              | States isolated per tenant                      |
| `workflow_transitions_tenant_isolation`         | `workflow_transitions`         | `tenant_id = current_setting(...)::uuid`              | Transitions isolated                            |
| `transition_rules_tenant_isolation`             | `transition_rules`             | `tenant_id = current_setting(...)::uuid`              | Business rules isolated                         |
| `instance_form_schemas_tenant_isolation`        | `instance_form_schemas`        | `tenant_id = current_setting(...)::uuid`              | Form schemas isolated                           |
| `workflow_instances_tenant_isolation`           | `workflow_instances`           | `tenant_id = current_setting(...)::uuid`              | Instance data isolated                          |
| `we_user_shadows_tenant_isolation`              | `we_user_shadows`              | `tenant_id = current_setting(...)::uuid`              | Shadow read model isolated                      |
| `audit_logs_tenant_isolation`                   | `audit_logs`                   | `tenant_id = current_setting(...)::uuid`              | Audit history isolated                          |
| `notification_templates_tenant_isolation`       | `notification_templates`       | `tenant_id = current_setting(...)::uuid`              | Templates isolated                              |
| `notification_logs_tenant_isolation`            | `notification_logs`            | `tenant_id = current_setting(...)::uuid`              | Delivery history isolated                       |
| `webhook_configs_tenant_isolation`              | `webhook_configs`              | `tenant_id = current_setting(...)::uuid`              | Webhook endpoints isolated                      |
| `webhook_delivery_logs_tenant_isolation`        | `webhook_delivery_logs`        | `tenant_id = current_setting(...)::uuid`              | Delivery logs isolated                          |

**Tables without RLS:** `tenants` (is the root entity, has no `tenant_id` column) and `permissions` (global system-wide permission atoms, not tenant-scoped).

#### RLS Testing Strategy

**Unit tests:** Mock `RlsContextService` at the service layer. Test both the path where `tenantId` is set and the path where it is empty — the latter should result in an exception or zero rows, confirming fail-secure behaviour.

**Integration tests:** Use two real tenant contexts and verify that data written under tenant A is not readable when context is set to tenant B. Test that `bypassRls()` correctly returns cross-tenant data (for admin operation tests only).

**Security tests:** Attempt a direct `SELECT * FROM workflow_instances` against the database with no `set_config` call — confirm that zero rows are returned. Attempt injection patterns in query parameters and verify RLS still filters the result set to the current tenant.

### 4.3 Tenant Context Propagation

The `tenantId` flows through every layer of the system from a single authoritative source — the JWT `tenantId` claim:

```
JWT payload.tenantId
    ↓ (populated by JwtAuthGuard + Passport)
req.user.tenantId
    ↓ (read by TenantContextInterceptor)
req.tenantId                          ← application-layer shortcut
    ↓ (read by DatabaseContextInterceptor)
PostgreSQL session: app.tenant_id     ← database-layer enforcement
    ↓ (read by RLS policy on every query)
Result set filtered to tenant
```

The `tenantId` is never accepted from request parameters, query strings, or request bodies for security-sensitive operations — it is always derived exclusively from the JWT. This eliminates the possibility of a tenant ID injection attack.

### 4.4 Cross-Tenant Attack Prevention

Beyond RLS, several additional controls prevent cross-tenant access:

**Tenant ID source of truth:** `tenantId` comes exclusively from `req.user.tenantId` (decoded JWT). No API endpoint accepts `tenantId` as a path parameter or body field for its own identity — a user cannot request data as "another tenant."

**JWT signature verification:** Forging a JWT with a different `tenantId` requires knowledge of `JWT_SECRET`. The `JwtStrategy` validates the HS256 signature on every request.

**No direct cross-module DB access:** No module imports another module's `Repository` or `DataSource` directly. All cross-module reads go through Symbol-token contracts. This prevents accidental bypass of RLS context through a secondary data source without the interceptor chain.

**Shadow table boundaries:** The `we_user_shadows` table is owned by `WorkflowExecutionModule` and populated exclusively from NATS events. It contains only the `tenantId` of the user's original tenant. RLS on this table prevents any execution module query from reading shadows belonging to a different tenant.

---

## 5. Rate Limiting & Abuse Prevention

### 5.1 Per-Tenant Rate Limiting

The `EnhancedRateLimitMiddleware` (`src/infra/middlewares/enhanced-rate-limit.middleware.ts`) implements a **leaky bucket algorithm** using atomic Lua scripts executed on Redis. This middleware is applied to all routes except `/health` and `/health/ready`.

#### Problem: Noisy Neighbour

In a shared multi-tenant system, one tenant making burst API calls (e.g., an integration script or data migration) can exhaust shared CPU, DB connection pool slots, or Redis bandwidth — degrading response times for all other tenants. Fixed time windows (standard `ThrottlerGuard`) do not isolate tenants from each other.

#### Solution: Per-Tenant Leaky Bucket

Each tenant and each user within a tenant maintains an **independent Redis bucket**. The leaky bucket model allows legitimate traffic bursts (up to the bucket capacity) while enforcing a smooth sustained throughput (the leak rate):

```
Redis key structure:
  wf-bucket:{tenantId}:tenant          ← tenant-level bucket
  wf-bucket:{tenantId}:user:{userId}   ← user-level bucket within that tenant
```

**Rate limiting tiers:**

| Scope  | Burst Capacity | Sustained Rate           | Key Pattern                          |
| ------ | -------------- | ------------------------ | ------------------------------------ |
| Tenant | 1,000 requests | 600 req/min (10 req/sec) | `wf-bucket:{tenantId}:tenant`        |
| User   | 200 requests   | 120 req/min (2 req/sec)  | `wf-bucket:{tenantId}:user:{userId}` |

Both checks run on every request. A request is only allowed if **both** the tenant bucket and the user bucket have at least 1 token. This means:

- A user within a heavy-usage tenant is still bounded to 200 burst / 120 rpm.
- Multiple users within a tenant collectively cannot exceed 1,000 burst / 600 rpm.
- Tenant A's traffic profile has zero impact on Tenant B's bucket.

#### Lua Script (Atomic Operation)

```lua
-- KEYS[1] = bucket key
-- ARGV[1] = capacity, ARGV[2] = leak_rate (tokens/sec), ARGV[3] = now (ms epoch)

local bucket     = redis.call('HMGET', KEYS[1], 'tokens', 'last_refill')
local tokens     = tonumber(bucket[1]) or tonumber(ARGV[1])
local last_refill = tonumber(bucket[2]) or tonumber(ARGV[3])

-- Drain tokens based on elapsed time
local elapsed    = (tonumber(ARGV[3]) - last_refill) / 1000
local leaked     = math.floor(elapsed * tonumber(ARGV[2]))
tokens           = math.max(0, tokens - leaked)

-- Consume one token if available
local allowed = 0
if tokens >= 1 then
  tokens  = tokens - 1
  allowed = 1
end

redis.call('HMSET', KEYS[1], 'tokens', tokens, 'last_refill', ARGV[3])
redis.call('EXPIRE', KEYS[1], 3600)
return { allowed, tokens, reset_time }
```

The entire check-and-consume operation is atomic — no two concurrent requests can interleave their token reads and writes, preventing over-counting bugs that plague multi-step Redis operations.

#### Rate Limit Response Headers

Every allowed response includes:

```http
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 156
X-RateLimit-Reset: 2024-03-05T12:25:00.000Z
X-RateLimit-Tenant-Remaining: 847
X-RateLimit-User-Remaining: 156
```

Rate limit exceeded response:

```json
{
  "statusCode": 429,
  "message": "Too many requests from your organization",
  "retryAfter": 30
}
```

#### Exemptions

- `SYSTEM_ADMIN` role: bypasses all rate limiting.
- Health check endpoints (`/health`, `/health/ready`): excluded via `MiddlewareConsumer.exclude()`.
- Unauthenticated requests: skipped (handled upstream by auth guards).

#### Fail-Safe Behaviour

Redis unavailability causes fail-open: the middleware catches the exception, logs `WARN: Enhanced rate limiting Redis error — passing through`, and calls `next()`. This preserves service availability during Redis outages at the cost of temporarily losing per-tenant limiting. The backup `ThrottlerGuard` continues to enforce basic global limits.

### 5.2 IP-Based / Global Rate Limiting

`ThrottlerGuard` (`@nestjs/throttler ^6.5.0`) is registered as the first `APP_GUARD`. It uses in-memory storage and enforces a global limit configured via environment variables:

```typescript
ThrottlerModule.forRootAsync({
  useFactory: (config) => [
    {
      ttl: +config.get("THROTTLE_TTL"), // sliding window in seconds
      limit: +config.get("THROTTLE_LIMIT"), // max requests per window
    },
  ],
});
```

This guard acts as the last line of defence when Redis is unavailable. It is not tenant-aware — it enforces a uniform limit across all requests regardless of tenant context.

**Request Flow with Both Rate Limiters:**

```
Incoming Request
    ↓
1. EnhancedRateLimitMiddleware (Middleware layer)
   ├── Redis available → per-tenant leaky bucket check
   └── Redis failed  → allow through + WARN log
    ↓
2. ThrottlerGuard (Guard layer)
   └── Memory-based global limit (no Redis dependency)
    ↓
3. JwtAuthGuard → TenantIsolationGuard → RolesGuard
    ↓
4. Controller
```

### 5.3 DDoS Considerations

The system is designed for deployment on Render (or similar cloud platforms) where an upstream load balancer or CDN handles volumetric DDoS mitigation before traffic reaches the application. The application-layer rate limiting covers application-level abuse (API scraping, credential stuffing, noisy neighbours) rather than raw packet-flood attacks.

`app.set('trust proxy', 1)` is configured in `main.ts`, enabling the `X-Forwarded-For` header to be used for real IP extraction — this is required when the app sits behind a reverse proxy so that rate limit buckets are keyed on the real client IP rather than the proxy's IP.

Request body size is capped at **50 KB** (`app.use(json({ limit: '50kb' }))`), preventing HTTP body-based memory exhaustion attacks.

---

## 6. Input Validation & Sanitization

### 6.1 DTO Validation (class-validator)

`ValidationPipe` is registered globally in `main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    transform: true, // auto-coerce query params (string → number, etc.)
    stopAtFirstError: true, // return first failure per field, not all
  }),
);
```

Every controller method that accepts a request body or query parameters is backed by a DTO class decorated with `class-validator` constraints. Representative constraints used throughout the codebase:

- `@IsUUID('4')` — enforces UUIDs on all ID fields; prevents non-UUID strings reaching the database
- `@IsEmail()` — validates email format before storage
- `@IsString()`, `@MaxLength(255)`, `@MinLength(1)` — length bounds on all VARCHAR columns
- `@IsEnum(WorkflowStatus)` — prevents invalid enum values
- `@IsObject()`, `@ValidateNested()` — nested validation for JSONB payload fields
- `@IsOptional()` — distinguishes optional from required fields at the DTO level

On validation failure, the `GlobalExceptionFilter` converts the `BadRequestException` to:

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION_ERROR",
  "message": ["email must be an email", "password must be longer than 8 characters"],
  "timestamp": "2024-03-05T12:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

`stopAtFirstError: true` means at most one error per field is returned — this prevents information leakage about the full validation ruleset.

### 6.2 SQL Injection Prevention

All database queries use TypeORM's **parameterized query binding**. TypeORM generates `$1`, `$2`, ... positional placeholders for all user-supplied values — the values are never interpolated into the query string.

The one place where raw SQL is written — the `ExecuteTransitionHandler` optimistic lock UPDATE — uses explicit positional parameters:

```typescript
em.query(
  `
  UPDATE workflow_instances
  SET current_state_id = $1,
      current_state_name = $2,
      version = version + 1,
      status = $3,
      completed_at = $4,
      updated_at = NOW()
  WHERE id = $5
    AND version = $6
    AND tenant_id = $7
`,
  [toStateId, toStateName, newStatus, completedAt, instanceId, lastKnownVersion, tenantId],
);
```

All seven parameters are bound separately, not concatenated. Additionally, PostgreSQL RLS provides a second layer — even hypothetical injection would be constrained to the current tenant's rows.

### 6.3 XSS Prevention

Three layers address XSS:

**`xss-clean` middleware** (`xss-clean ^0.1.4`): Applied globally in `main.ts` via `app.use(xssClean())`. Strips HTML tags and JavaScript event handlers from incoming request bodies and query strings before they reach any controller.

**`hpp` middleware** (`hpp ^0.2.3`): HTTP Parameter Pollution prevention. Collapses duplicate query parameters (e.g., `?role=Admin&role=Admin`) into the last value, preventing array-based bypass attempts against validation logic.

**Content-Security-Policy via Helmet**: The `contentSecurityPolicy` directive (see Section 10) restricts which origins may execute scripts. This limits the damage of any stored XSS that escapes the input sanitization layer.

**`class-transformer` serialization**: The `ClassSerializerInterceptor` calls `instanceToPlain()` on all outgoing response objects. This ensures `@Exclude()` fields (e.g., `passwordHash`) are never present in response bodies — preventing accidental data leakage even if a query returns the full entity.

### 6.4 CSRF Protection

`csurf` (`^1.11.0`) is applied as Express middleware in `main.ts`. It implements the **Synchronizer Token Pattern**:

1. The frontend calls `GET /api/v1/auth/csrf-token` (a `@Public()` route) to retrieve a CSRF token.
2. The `csurf` middleware generates a token derived from an `HttpOnly` cookie secret and returns it to the frontend.
3. For every mutating request (`POST`, `PUT`, `PATCH`, `DELETE`), the frontend includes this token in the `X-CSRF-Token` request header.
4. `csurf` validates the header token against the cookie secret on the server. Mismatch → `EBADCSRFTOKEN` error.

The `GlobalExceptionFilter` explicitly handles `EBADCSRFTOKEN`:

```typescript
if (exception?.code === "EBADCSRFTOKEN") {
  status = HttpStatus.FORBIDDEN;
  errorCode = "INVALID_CSRF_TOKEN";
}
```

CORS is configured to only allow `Origin` headers from `http://localhost:3000`, `http://localhost:8000`, and the configured `FR_BASE_URL` (production frontend). Preflight (`OPTIONS`) requests from unlisted origins receive a 403, preventing cross-origin requests from obtaining a valid CSRF token.

In local development (`STAGE=dev`), `ignoreMethods` is expanded to include all HTTP verbs, fully disabling CSRF enforcement for developer convenience. This is gated strictly on the `STAGE` environment variable.

---

## 7. Data Security

### 7.1 Encryption at Rest

The system stores data in PostgreSQL managed by the deployment platform (Render or equivalent). **Encryption at rest** is handled at the infrastructure level — managed PostgreSQL services on all major cloud platforms (AWS RDS, GCP Cloud SQL, Render) encrypt data files at rest using AES-256 by default.

At the application level, the following fields are never stored in plaintext:

| Field                       | Storage Format | Why                                                                                                                        |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `users.password_hash`       | Argon2id hash  | Passwords must not be recoverable even from DB dump                                                                        |
| `refresh_tokens.token_hash` | SHA-256 hash   | Raw tokens must not be usable even if DB is breached                                                                       |
| `webhook_configs.secret`    | Plaintext      | Used for HMAC-SHA256 signing at delivery time; requires reversibility; should be encrypted at rest at infrastructure level |

A future improvement is to encrypt `webhook_configs.secret` using an application-level encryption key (AES-GCM) before storage, so the application must present the decryption key to use it — reducing the impact of a direct DB read.

### 7.2 Encryption in Transit (TLS)

All API endpoints are served over HTTPS in hosted environments. The `Helmet` HSTS configuration enforces HTTPS at the browser level:

```typescript
helmet({
  hsts: {
    includeSubDomains: true,
    preload: true,
    maxAge: 63072000, // 2 years — required for HSTS preload list inclusion
  },
});
```

With `maxAge: 63072000` and `preload: true`, the domain can be submitted to the HSTS preload list, causing browsers to never attempt HTTP connections to it — eliminating SSL stripping attacks even on first visit.

CORS is configured with `credentials: true`, allowing cookies (used for CSRF secret) to be sent on cross-origin requests, while still restricting `Origin` to the allowlist.

NATS messaging between the app and the embedded NATS server uses a local connection (the NATS server runs in the same Docker container — see `Dockerfile`). External NATS connections in production deployments should use TLS-authenticated NATS cluster connections.

### 7.3 Sensitive Field Handling

**Password hash exclusion:** `User.passwordHash` is decorated with `@Exclude()` from `class-transformer`. The globally registered `ClassSerializerInterceptor` calls `instanceToPlain()` on all response bodies, which respects `@Exclude()` and removes the field from every API response.

**Refresh token storage:** Only `tokenHash = sha256(rawToken)` is stored. The raw UUID-format token is sent to the client on issuance and never persisted anywhere. If an attacker reads the `refresh_tokens` table, they obtain a list of SHA-256 hashes — reversing SHA-256 to find the original UUID is computationally infeasible.

**Logging:** `LoggingInterceptor` explicitly does **not** log request or response bodies — only `method`, `url`, `statusCode`, `userId`, `tenantId`, and `durationMs`. This prevents credentials, JWT tokens, and JSONB payloads (which may contain business-sensitive data) from appearing in log files.

**JSONB payload opacity:** `workflow_instances.payload` is stored as JSONB and returned to authorised callers. The system makes no attempt to inspect or redact payload contents — it is the tenant's responsibility to not store non-workflow-relevant PII in the payload field.

### 7.4 PII Considerations

The system stores the following personal data:

| Field                      | Table               | Legal Basis                               | Retention                      |
| -------------------------- | ------------------- | ----------------------------------------- | ------------------------------ |
| `email`                    | `users`             | Contractual necessity (account)           | Until account deleted          |
| `first_name`, `last_name`  | `users`             | Contractual necessity (account)           | Until account deleted          |
| `last_login_at`            | `users`             | Legitimate interest (security monitoring) | With account                   |
| `actor_email`              | `audit_logs`        | Compliance / legal obligation             | Indefinite (immutable)         |
| `email`                    | `we_user_shadows`   | Operational necessity (display in UI)     | Until `USER_DEACTIVATED` event |
| `ip_address`, `user_agent` | `audit_logs`        | Security / fraud prevention               | Indefinite (immutable)         |
| `recipient_email`          | `notification_logs` | Notification delivery                     | TTL per tenant policy          |

The audit log's immutability (PostgreSQL trigger blocking `UPDATE`/`DELETE`) creates a tension with right-to-erasure (GDPR Article 17) if personal data is embedded in audit records. The recommended approach for production deployments is to store a **pseudonymous identifier** (e.g., a user UUID) in `actor_id` and resolve display names at query time from the live `users` table — however the current implementation also stores `actorEmail` and `actorRole` as snapshots for historical accuracy. This trade-off should be reviewed with legal counsel for GDPR-regulated deployments.

---

## 8. Secret Management

### 8.1 Environment Variable Strategy

All secrets and environment-specific configuration are loaded from environment variables at startup. The `ConfigModule` (configured in `AppModule`) reads from `.env.stage.${STAGE}` and `.env` files (via `envFilePath`). A Joi validation schema (`envSchema` from `libs/shared`) validates all required variables at startup — the application will not start if any required secret is missing or incorrectly typed:

**Required secrets validated by `envSchema`:**

| Variable                                           | Purpose                                     | Never Logged |
| -------------------------------------------------- | ------------------------------------------- | ------------ |
| `JWT_SECRET`                                       | HS256 JWT signing key                       | ✅           |
| `JWT_EXPIRY`                                       | Access token expiry (e.g., `15m`)           | ✅           |
| `JWT_REFRESH_EXPIRY_DAYS`                          | Refresh token TTL in days                   | ✅           |
| `DB_URL`                                           | PostgreSQL connection string                | ✅           |
| `REDIS_URL`                                        | Redis connection string                     | ✅           |
| `NATS_URL`                                         | NATS server URL                             | ✅           |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email delivery credentials                  | ✅           |
| `FR_BASE_URL`                                      | Allowed CORS origin for production frontend | —            |
| `STAGE`                                            | Environment tag (`dev`, `uat`, `prod`)      | —            |
| `THROTTLE_TTL`, `THROTTLE_LIMIT`                   | Global rate limiter configuration           | —            |

The application is instrumented with a startup comment referencing AWS Secrets Manager integration (`// FIXME: have it if you are using secret manager`). In production deployments, secrets should be injected via the platform's secret store (Render secret groups, AWS SSM Parameter Store, or HashiCorp Vault) rather than `.env` files.

**Server fingerprinting suppression:** `app.disable('x-powered-by')` is called in `main.ts`, and Helmet's `hidePoweredBy: true` option is enabled — removing the `X-Powered-By: Express` header that would otherwise reveal the technology stack to attackers.

Swagger UI is entirely disabled in `prod`/`production` stages — the API schema is not exposed publicly, reducing the information available to attackers for reconnaissance.

### 8.2 Secret Rotation Policy (Conceptual)

**JWT Secret:** Rotating `JWT_SECRET` invalidates all outstanding access tokens immediately — users will receive `401 Unauthorized` on their next request and will be required to re-login. A graceful rotation strategy would involve:

1. Introduce `JWT_SECRET_NEW` alongside `JWT_SECRET`.
2. Update `JwtStrategy` to accept tokens signed by either key.
3. Issue all new tokens signed with `JWT_SECRET_NEW`.
4. After all existing tokens expire (15 minutes), retire `JWT_SECRET`.

**Database Password:** Requires updating `DB_URL` in the secret store and redeploying the application. Connection pools will reconnect automatically if `DB_URL` is reloaded on startup.

**Refresh Tokens:** No rotation needed at the platform level — individual refresh tokens are already rotated on every use. If a mass revocation is required (e.g., a breach), truncating the `refresh_tokens` table forces all users to re-login.

**Webhook Secrets:** Per-webhook secrets stored in `webhook_configs.secret`. Rotation requires the tenant admin to update the secret via the API and simultaneously update their webhook receiver's validation logic.

---

## 9. Audit & Monitoring

### 9.1 Audit Module Design

The `AuditModule` implements a **fully decoupled, append-only audit log** that operates exclusively through NATS event consumption. The audit trail is never written directly by controllers or command handlers — it is written as a side effect of domain events.

**Key design properties:**

**Immutability:** An PostgreSQL trigger installed in migration `1772830604496` blocks `UPDATE` and `DELETE` on the `audit_logs` table:

```sql
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable: UPDATE/DELETE not permitted on audit_logs';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutability_trigger
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

This is database-enforced — no amount of application code or SQL injection can modify an existing audit record.

**Idempotency:** `AuditLogRepository.insertIfAbsent(eventId, ...)` checks for an existing row with the same `event_id` before inserting. The `audit_logs.event_id` column has a `UNIQUE` constraint as a database-level backstop. NATS messages can be safely replayed without creating duplicate audit entries.

**Snapshot fields:** Each `AuditLog` captures `actorEmail`, `actorRole`, `fromState`, `toState`, and `transitionName` at the time of the event. Even if the user's email changes later or the role is renamed, the historical record remains accurate.

**Non-blocking writes:** `AuditSubscriber` processes NATS events asynchronously. Errors in audit persistence are logged but do not propagate to the source transaction — audit failure never blocks the business operation that triggered it.

### 9.2 Audit Event Catalogue

| NATS Event                                | Trigger                         | Actor Captured   | Data Captured                                                                                                                   |
| ----------------------------------------- | ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `auth.user.created`                       | New user registration           | System / Admin   | `userId`, `email`, `tenantId`, `assignedRoles`                                                                                  |
| `auth.user.deactivated`                   | User deactivation               | Admin            | `userId`, `email`, `deactivatedBy`                                                                                              |
| `auth.user.roles-updated`                 | Role assignment / removal       | Admin            | `userId`, `previousRoles`, `newRoles`, `updatedBy`                                                                              |
| `tenant.created`                          | Tenant onboarding               | System           | `tenantId`, `tenantSlug`, `plan`                                                                                                |
| `tenant.deactivated`                      | Tenant deactivation             | Platform admin   | `tenantId`, `deactivatedAt`                                                                                                     |
| `tenant.plan-updated`                     | Plan upgrade / downgrade        | Platform admin   | `tenantId`, `previousPlan`, `newPlan`                                                                                           |
| `workflow-definition.published`           | Workflow publish                | Tenant user      | `definitionId`, `versionNumber`, `publishedBy`                                                                                  |
| `workflow-definition.deprecated`          | Workflow deprecation            | Tenant user      | `definitionId`, `deprecatedBy`                                                                                                  |
| `workflow-execution.instance.created`     | New instance creation           | Tenant user      | `instanceId`, `definitionId`, `definitionVersion`, `payload`, `createdBy`                                                       |
| `workflow-execution.transition.completed` | State transition                | Tenant user      | `instanceId`, `transitionId`, `fromState`, `toState`, `actorId`, `actorEmail`, `actorRole`, `comment`, `ipAddress`, `userAgent` |
| `workflow-execution.instance.completed`   | Instance reaches terminal state | System (derived) | `instanceId`, `finalState`, `completedAt`                                                                                       |
| `workflow-execution.instance.cancelled`   | Instance cancellation           | Tenant user      | `instanceId`, `cancelledBy`, `reason`                                                                                           |
| `notification.send.email`                 | Email dispatch attempt          | System           | `templateId`, `recipientEmail`, `eventTrigger`, `status`                                                                        |
| `notification.webhook.trigger`            | Webhook delivery attempt        | System           | `webhookConfigId`, `eventName`, `httpStatus`, `deliveredAt`                                                                     |

### 9.3 Security Monitoring Strategy

**Structured logging:** `LoggingInterceptor` emits a JSON log line per request containing `{ method, url, statusCode, userId, tenantId, durationMs }`. These logs are shipped to the platform's log aggregation service (e.g., Render logs, AWS CloudWatch) for alerting.

**Security-relevant log events to alert on:**

| Event                            | Log Signal                              | Alert Condition                    |
| -------------------------------- | --------------------------------------- | ---------------------------------- |
| Brute force attempt              | `401 INVALID_CREDENTIALS` from same IP  | > 10 per minute from one IP        |
| Rate limit violations            | `429 Too Many Requests`                 | Sustained tenant bucket exhaustion |
| CSRF violations                  | `403 INVALID_CSRF_TOKEN`                | Any occurrence in production       |
| Cross-tenant attempt             | `403 TENANT_MISMATCH`                   | Any occurrence                     |
| RLS bypass attempt               | PostgreSQL error in context interceptor | Any occurrence                     |
| Audit log write failure          | `AuditSubscriber` error log             | Any occurrence                     |
| Token refresh with revoked token | `401 INVALID_REFRESH_TOKEN`             | > 5 per hour from same user        |

**Audit log querying:** Security teams can query `GET /api/v1/workflow-instances/:id/audit-logs` for instance-level history, or query the `audit_logs` table directly with `WHERE tenant_id = :tenantId AND action_type IN (...)` for compliance reviews. The `(tenant_id, created_at)` composite index supports efficient time-range scans.

---

## 10. Security Headers & HTTP Hardening

All security headers are applied by the `helmet` middleware (`^8.1.0`) configured in `main.ts`. The following headers are set on every HTTP response:

| Header                              | Value                                                                                          | Purpose                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Strict-Transport-Security`         | `max-age=63072000; includeSubDomains; preload`                                                 | Forces HTTPS for 2 years; eligible for browser preload list                  |
| `Content-Security-Policy`           | `default-src 'self' ...` (see below)                                                           | Controls which resources the browser may load; prevents XSS                  |
| `X-CSRF-Token`                      | `<token>` (returned by `GET /api/v1/csrf-token`)                                               | Prevents CSRF attacks by requiring a valid token for state-changing requests |
| `X-Frame-Options`                   | `DENY` (via `frameguard`)                                                                      | Prevents clickjacking by disabling iframe embedding                          |
| `X-Content-Type-Options`            | `nosniff`                                                                                      | Prevents MIME-type sniffing; reduces MIME confusion attacks                  |
| `X-XSS-Protection`                  | `1; mode=block` (via `xssFilter`)                                                              | Enables legacy XSS filter in older browsers                                  |
| `Referrer-Policy`                   | `no-referrer`                                                                                  | No referrer information sent cross-origin                                    |
| `X-DNS-Prefetch-Control`            | `off`                                                                                          | Disables DNS prefetching; prevents information leakage                       |
| `Permissions-Policy`                | `fullscreen=(self), camera=(), geolocation=(self ...), autoplay=(), payment=(), microphone=()` | Disables unneeded browser APIs                                               |
| `X-Permitted-Cross-Domain-Policies` | `none`                                                                                         | Prevents Flash/Acrobat cross-domain data loading                             |
| `Origin-Agent-Cluster`              | `?1`                                                                                           | Enforces process isolation per origin                                        |
| `Cross-Origin-Opener-Policy`        | `same-origin-allow-popups`                                                                     | Isolates browsing context; prevents Spectre-style attacks                    |
| `Cross-Origin-Resource-Policy`      | `cross-origin`                                                                                 | Set to cross-origin for legitimate CDN resource loading                      |
| `X-Powered-By`                      | _(removed)_                                                                                    | Eliminates Express/Node.js stack fingerprinting                              |

**Content-Security-Policy directives:**

```
default-src 'self' https://polyfill.io https://*.cloudflare.com
script-src  'self' https://*.cloudflare.com https://polyfill.io https: 'unsafe-inline'
style-src   'self' https: http: 'unsafe-inline'
img-src     'self' blob: validator.swagger.io
font-src    'self' https: data:
frame-src   'self'
base-uri    'self'
```

The `script-src: 'unsafe-inline'` is noted as a `FIXME` in the source code — it should be replaced with **CSP nonces** in future to eliminate inline script execution as an XSS vector.

**Additional hardening in `main.ts`:**

- `app.disable('x-powered-by')` — belt-and-suspenders removal of the Express fingerprint header
- `app.set('trust proxy', 1)` — enables real-IP extraction from `X-Forwarded-For` when behind a reverse proxy (required for accurate rate limit keying)
- `app.use(json({ limit: '50kb' }))` + `app.use(urlencoded({ extended: true, limit: '50kb' }))` — caps request body size to prevent memory exhaustion

---

## 11. Dependency Security

The system uses a curated set of well-maintained, high-adoption security packages. Key security dependencies and their roles:

| Package             | Version   | Security Role                                                                                              |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `argon2`            | `^0.44.0` | Password hashing (Argon2id algorithm)                                                                      |
| `@nestjs/jwt`       | `^11.0.2` | JWT signing and verification                                                                               |
| `passport-jwt`      | `^4.0.1`  | JWT strategy for Passport authentication                                                                   |
| `helmet`            | `^8.1.0`  | Comprehensive HTTP security headers                                                                        |
| `csurf`             | `^1.11.0` | CSRF protection (Synchronizer Token Pattern)                                                               |
| `xss-clean`         | `^0.1.4`  | XSS payload sanitisation on request bodies                                                                 |
| `hpp`               | `^0.2.3`  | HTTP Parameter Pollution prevention                                                                        |
| `class-validator`   | `^0.15.1` | DTO schema validation                                                                                      |
| `class-transformer` | `^0.5.1`  | Response serialization with `@Exclude()`                                                                   |
| `@nestjs/throttler` | `^6.5.0`  | Global backup rate limiter                                                                                 |
| `ioredis`           | `^5.10.0` | Redis client — used for per-tenant rate limit buckets and idempotency locks                                |
| `cookie-parser`     | `^1.4.7`  | Cookie parsing required for CSRF secret storage                                                            |
| `compression`       | `^1.8.1`  | Response compression (reduces bandwidth, not a security control, but can limit response-based enumeration) |
| `joi`               | `^18.0.2` | Startup environment variable validation — prevents misconfigured secrets from going unnoticed              |

**Dependency security practices:**

`npm audit` should be run as part of the CI pipeline to detect known CVEs in transitive dependencies. The `package-lock.json` pins all transitive dependencies to exact versions, preventing supply chain attacks via floating ranges.

The `csurf` package is noted as having been deprecated by its maintainer in 2023 — a migration to an actively maintained CSRF library (e.g., `@fastify/csrf-protection` or a custom Double Submit Cookie implementation) should be planned before the package falls outside of community security monitoring.

The `Dockerfile` uses `oven/bun:1-alpine` as the base image — Alpine-based images have a minimal attack surface (no unnecessary system utilities). The embedded NATS server binary (`nats-server v2.12.0`) is downloaded during the build stage and should be verified against its published SHA-256 checksum in the build pipeline.

---

_Document 07 of 13 — Security Design_  
_Cross-reference: `03-LOW-LEVEL-DESIGN.md` for guard and interceptor implementation details, `05-DATABASE-DESIGN.md` for the full RLS policy catalogue and migration strategy, `08-SCALABILITY-PERFORMANCE.md` for rate limiting performance and Redis failure scenarios_
