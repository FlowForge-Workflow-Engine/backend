---
title: High Level Design
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# High Level Design

> This document describes the structural and behavioral design of the Multi-Tenant Workflow Engine SaaS platform — how its major components are organized, how they communicate, and how end-to-end system flows are executed. The target reader is a mid-level engineer joining the team who needs to understand how the system works before contributing to it.

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Major Components & Modules](#2-major-components--modules)
  - [2.1 Component Responsibilities](#21-component-responsibilities)
  - [2.2 API Boundaries](#22-api-boundaries)
  - [2.3 External Integrations](#23-external-integrations)
- [3. Component Interactions](#3-component-interactions)
  - [3.1 Module Dependency Rules](#31-module-dependency-rules)
  - [3.2 Contract-Based Communication](#32-contract-based-communication)
  - [3.3 Shared Kernel / Common Layer](#33-shared-kernel--common-layer)
- [4. Major System Flows](#4-major-system-flows)
  - [4.1 User Registration & Authentication Flow](#41-user-registration--authentication-flow)
  - [4.2 Tenant Onboarding Flow](#42-tenant-onboarding-flow)
  - [4.3 Workflow Definition Creation Flow](#43-workflow-definition-creation-flow)
  - [4.4 Workflow Execution Flow (trigger → completion)](#44-workflow-execution-flow-trigger--completion)
  - [4.5 Rule Evaluation Flow](#45-rule-evaluation-flow)
  - [4.6 Audit Trail Flow](#46-audit-trail-flow)
- [5. Data Flow Across Layers](#5-data-flow-across-layers)
  - [5.1 HTTP Layer → Application Layer → Domain Layer → Persistence Layer](#51-http-layer--application-layer--domain-layer--persistence-layer)
  - [5.2 Tenant Context Propagation](#52-tenant-context-propagation)
- [6. Frontend Architecture](#6-frontend-architecture)
  - [6.1 Frontend Module Structure](#61-frontend-module-structure)
  - [6.2 State Management Strategy (Zustand + TanStack Query)](#62-state-management-strategy-zustand--tanstack-query)
  - [6.3 API Integration Pattern](#63-api-integration-pattern)

---

## 1. Overview

The Multi-Tenant Workflow Engine is a B2B SaaS platform that enables businesses (tenants) to model, version, and execute approval-based workflows — without writing code. It is architected as a **Microservice-Extractable Contract-First Modular Monolith**: a single deployable NestJS application whose internal module boundaries are as strict as if they were separate services, so that each module can be extracted into an independent microservice with minimal refactoring when the time comes.

The system is built around two primary concerns:

- **Design-time** — Tenants create workflow definitions (states, transitions, rules, roles) using the visual designer. Definitions are versioned and published as immutable snapshots.
- **Runtime** — Tenants create workflow instances from published snapshots. Users execute transitions; the engine validates roles, evaluates rules, persists state changes atomically, and emits events to drive notifications and audit.

At any time the system serves multiple tenants concurrently. All data is logically isolated by `tenant_id` enforced at both the application layer and the PostgreSQL Row-Level Security (RLS) layer.

> 📐 **[DIAGRAM PLACEHOLDER]**
> *Type:* System Context Diagram
> *Description:* Shows the platform boundary with tenant users, the SaaS API, PostgreSQL, Redis, NATS, and outbound notification targets (SMTP, webhook URLs).
> *To be created separately.*

---

## 2. Major Components & Modules

### 2.1 Component Responsibilities

The backend is organized as a NestJS modular monolith. The table below catalogues every module, its bounded context, its directory, and its core responsibility.

| Module | Directory | Bounded Context | Core Responsibility |
|--------|-----------|-----------------|---------------------|
| **AuthModule** | `src/modules/auth/` | Identity | User registration, login, JWT issuance, JWT refresh, logout, RBAC (roles, permissions), password hashing with Argon2 |
| **TenantModule** | `src/modules/tenant/` | Tenancy | Tenant creation, settings, feature flags, plan management. Publishes `TENANT_CREATED` and `TENANT_DEACTIVATED` events via NATS |
| **WorkflowDefinitionModule** | `src/modules/workflow-definition/` | Workflow Design | CRUD for workflow definitions, states, transitions, and transition rules; versioned publishing; immutable snapshot creation; form schema management |
| **WorkflowExecutionModule** | `src/modules/workflow-execution/` | Workflow Runtime | Creating and managing workflow instances; executing transitions via CQRS; optimistic locking; shadow user read model (Pattern 3) |
| **RuleEngineModule** | `src/modules/rule-engine/` | Rule Evaluation | Stateless evaluation of `json-rules-engine` JSON ASTs against a runtime context object. No database writes. Consumed synchronously by the execution module |
| **AuditModule** | `src/modules/audit/` | Compliance | Append-only, immutable audit log. Writes synchronously inside the transition DB transaction. Exposes paginated read API for instance audit history |
| **NotificationModule** | `src/modules/notification/` | Notifications | Email (Pug templates + Nodemailer) and outbound HTTP webhooks (HMAC-SHA256 signed). Listens to workflow NATS events, matches templates, delivers asynchronously |
| **DashboardModule** | `src/modules/dashboard/` | Analytics | Aggregated stats (total workflows, instances by status, recent activity) for the tenant dashboard |
| **DatabaseModule** | `src/modules/database/` | Infrastructure | TypeORM DataSource bootstrap, `RlsContextService`, `DatabaseContextInterceptor` for per-request PostgreSQL session context |
| **HealthModule** | `src/modules/health/` | Observability | `GET /health` and `GET /health/ready` endpoints reporting DB, Redis, and NATS liveness |
| **InfraModule** | `src/infra/` | Infrastructure | Redis client (`ioredis`), NATS client configuration, Winston logger configuration, `EnhancedRateLimitMiddleware` |
| **Shared Library** | `libs/shared/src/` | Cross-cutting | Guards, decorators, interceptors, exception filters, DTOs, contract interfaces, NATS event enums, and event payload interfaces — used by all modules |

**Frontend** is a separate Vite + React application deployed independently. It communicates with the backend exclusively through the versioned REST API.

| Frontend Layer | Directory | Responsibility |
|----------------|-----------|----------------|
| Pages | `src/pages/` | Route-level views for auth, workflows, instances, users, roles, notifications, webhooks, dashboard, settings |
| Common Components | `src/components/common/` | Reusable UI: `DataTable`, `LoadingSpinner`, `PageHeader`, `StatusBadge`, `EmptyState`, `ConfirmDialog` |
| Layout Components | `src/components/layout/` | `AppShell`, `Sidebar`, `Topbar` — persistent shell around authenticated pages |
| Auth Components | `src/components/auth/` | `ProtectedRoute`, `AdminRoute` — route guards based on Zustand auth state |
| UI Primitives | `src/components/ui/` | shadcn/ui components built on Radix UI primitives |
| Stores | `src/stores/` | `auth-store.ts` (Zustand, persisted), `workflow-designer-store.ts` (Zustand, in-memory) |
| API Client | `src/lib/api-client.ts` | Axios instance with JWT request interceptor and 401 auto-refresh interceptor |
| Query Keys | `src/lib/query-keys.ts` | Centralized TanStack Query cache key factories |
| Type Definitions | `src/types/api.ts` | TypeScript interfaces matching backend response shapes |

---

### 2.2 API Boundaries

All API routes are served under the prefix `/api/v1` (global prefix `/api` + URI versioning `defaultVersion: "1"`). The table below shows the resource grouping and the module that owns each group.

| Resource Group | Path Prefix | Owning Module | Auth Required |
|----------------|-------------|---------------|---------------|
| Authentication | `/api/v1/auth/` | AuthModule | Partial (`@Public()` on login/register) |
| Users | `/api/v1/users/` | AuthModule | ✅ JWT + Roles |
| Roles | `/api/v1/roles/` | AuthModule | ✅ JWT + Roles |
| CSRF Token | `/api/v1/csrf-token` | AuthModule | ❌ Public |
| Tenants | `/api/v1/tenants/` | TenantModule | ✅ JWT + Roles |
| Workflow Definitions | `/api/v1/workflow-definitions/` | WorkflowDefinitionModule | ✅ JWT |
| Workflow Instances | `/api/v1/workflow-instances/` | WorkflowExecutionModule | ✅ JWT |
| Audit Logs | `/api/v1/workflow-instances/:id/audit-logs` | AuditModule | ✅ JWT |
| Rule Metadata | `/api/v1/workflow-rules/metadata` | RuleEngineModule | ✅ JWT |
| Notification Templates | `/api/v1/notification-templates/` | NotificationModule | ✅ JWT |
| Webhook Configs | `/api/v1/webhook-configs/` | NotificationModule | ✅ JWT |
| Dashboard | `/api/v1/dashboard/` | DashboardModule | ✅ JWT |
| Health | `/health`, `/health/ready` | HealthModule | ❌ Public |

The following endpoints carry `@Public()` and bypass `JwtAuthGuard`:

```
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/register
POST /api/v1/auth/register/tenant
GET  /api/v1/csrf-token
GET  /health
GET  /health/ready
```

---

### 2.3 External Integrations

| Integration | Direction | Protocol | Purpose | Configuration |
|-------------|-----------|----------|---------|---------------|
| **PostgreSQL 16** | Outbound | TCP (TypeORM) | Primary data store for all domain entities | `DATABASE_URL` env var |
| **Redis 7** | Outbound | TCP (ioredis) | Rate limiting buckets, idempotency key TTL cache, workflow definition caching | `REDIS_URL` env var |
| **NATS 2.10** | Bidirectional | NATS protocol | Async inter-module event bus (hybrid microservice transport) | `NATS_URL` env var |
| **SMTP / AWS SES** | Outbound | SMTP | Transactional email delivery (Pug templates via `@nestjs-modules/mailer` + Nodemailer) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| **Tenant Webhook URLs** | Outbound | HTTPS POST | Event delivery to tenant-configured external systems. Signed with HMAC-SHA256: `X-Workflow-Signature: sha256=<hex>` | Stored per-tenant in `webhook_configs` table |
| **AWS Secrets Manager** | Outbound (optional) | HTTPS | Production secret loading at bootstrap | AWS SDK — configured but commented out for dev |
| **AWS S3** | Outbound (optional) | HTTPS | File attachment storage (SDK present in dependencies) | `@aws-sdk/client-s3` present in `package.json` |

The application itself runs as a **NestJS Hybrid Application**: it is simultaneously an HTTP server (Express) and a NATS microservice listener. The NATS subscriber half receives events published by modules within the same process during monolith mode, and will continue to receive events over the network after any module is extracted as a separate service.

> 📐 **[DIAGRAM PLACEHOLDER]**
> *Type:* Component Diagram
> *Description:* Shows all 11 modules as boxes inside the monolith boundary, with arrows to PostgreSQL, Redis, NATS (external broker), SMTP, and outbound webhook targets.
> *To be created separately.*

---

## 3. Component Interactions

### 3.1 Module Dependency Rules

The architecture enforces three non-negotiable module boundary rules. Violating any of them would break microservice extractability:

| Rule | Description | Enforcement Mechanism |
|------|-------------|----------------------|
| **No cross-module repository import** | Module A's `Repository` class is never imported or injected by Module B | NestJS DI: repositories are declared in `providers` and not exported from their module |
| **No cross-module internal service injection** | Module A's internal `Service` (e.g., `UserService`) is never injected by Module B | Module exports only the contract Symbol token, never the service class |
| **No cross-module ORM relations** | TypeORM `@ManyToOne` and `@OneToMany` decorators are only used within the same module's entities | Reviewed in `SCHEMA_DESIGN_PHILOSOPHY.md`; cross-module references use plain UUID columns |

The only three legitimate cross-module data access patterns are:

| Pattern | When Used | Mechanism | Example |
|---------|-----------|-----------|---------|
| **Pattern 1 — JWT Claims** | Data about the currently authenticated user (80% of cases) | `@CurrentUser()` decorator reads from `request.user` (JWT payload), zero DB calls | `WorkflowExecutionController` reading `user.tenantId` and `user.roles` without importing `AuthModule` |
| **Pattern 2 — Contract Interface** | Synchronous lookup of another module's entity by ID | Module A exports `Symbol` token → Module B injects the symbol, depends only on the interface | `WorkflowExecutionModule` consuming `WORKFLOW_QUERY_CONTRACT` exported by `WorkflowDefinitionModule` |
| **Pattern 3 — Shadow Read Model** | High-frequency query-time joins across module boundaries | Module B maintains its own shadow table synced via NATS event subscriber | `WorkflowExecutionModule` maintains `we_user_shadows` table; synced from `USER_CREATED` / `USER_DEACTIVATED` events; queried locally at list-instance time |

---

### 3.2 Contract-Based Communication

Three contract interfaces are defined in `libs/shared/src/interfaces/contracts/` and serve as the binding agreement between modules:

**`IUserQueryContract`** — `user-query.contract.ts`

- Token: `USER_QUERY_CONTRACT` (Symbol)
- Exported by: `AuthModule`
- Implemented by: `UserQueryService` (`src/modules/auth/services/user-query.service.ts`)
- Consumed by: `TenantModule`
- Methods: `findById(userId, tenantId)`, `findManyByIds(userIds, tenantId)`, `existsWithRole(userId, tenantId, role)`

**`ITenantQueryContract`** — `tenant-query.contract.ts`

- Token: `TENANT_QUERY_CONTRACT` (Symbol)
- Exported by: `TenantModule`
- Implemented by: `TenantQueryService` (`src/modules/tenant/services/tenant-query.service.ts`)
- Consumed by: `AuthModule` (during onboarding), `WorkflowExecutionModule`
- Methods: `findById(tenantId)`, `isFeatureEnabled(tenantId, flagKey)`, `getPlan(tenantId)`

**`IWorkflowQueryContract`** — `workflow-query.contract.ts`

- Token: `WORKFLOW_QUERY_CONTRACT` (Symbol)
- Exported by: `WorkflowDefinitionModule`
- Implemented by: `WorkflowQueryService` (`src/modules/workflow-definition/services/workflow-query.service.ts`)
- Consumed by: `WorkflowExecutionModule`
- Methods: `findDefinitionById(definitionId, tenantId)`, `getVersionSnapshot(definitionId, version, tenantId)`

**On microservice extraction**, each contract's implementation class is replaced with a gRPC or HTTP client. The consuming module's code remains unchanged because it only depends on the Symbol token and the TypeScript interface — never the class.

> 📐 **[DIAGRAM PLACEHOLDER]**
> *Type:* Module Dependency Diagram
> *Description:* Directed graph showing module-to-module dependencies via contract tokens and NATS events. Should clearly show no direct repository or service imports crossing module lines.
> *To be created separately.*

---

### 3.3 Shared Kernel / Common Layer

The `libs/shared/src/` library is the **Shared Kernel** — code that is genuinely shared across all modules with zero module-specific dependencies. It is consumed via the path alias `@app/shared`.

| Category | Files | Purpose |
|----------|-------|---------|
| **Constants** | `constants/nats-events.enum.ts`, `constants/app-errors.enum.ts`, `constants/default-system-roles.enum.ts` | Single source of truth for all NATS event names, application error codes, and default role names |
| **Decorators** | `decorators/current-user.decorator.ts`, `decorators/tenant-id.decorator.ts`, `decorators/roles.decorator.ts`, `decorators/public.decorator.ts`, `decorators/logger.decorator.ts`, `decorators/not-admin.decorator.ts` | Parameter and metadata decorators used in all controllers |
| **DTOs** | `dto/pagination.dto.ts`, `dto/id-param.dto.ts`, `dto/base-response.dto.ts` | Shared request/response shapes with `class-validator` decorators |
| **Entities** | `entities/base.entity.ts` | Abstract `BaseEntity` with `id` (UUID PK), `tenantId`, `createdAt`, `updatedAt` — extended by all domain entities |
| **Filters** | `filters/global-exception.filter.ts`, `filters/httpexception.filter.ts` | Global exception handler returning standardized `{ statusCode, errorCode, message, timestamp, path }` |
| **Guards** | `guards/jwt-auth.guard.ts`, `guards/tenant-isolation.guard.ts`, `guards/roles.guard.ts`, `guards/throttler-behind-proxy.guard.ts` | Applied globally via `APP_GUARD` in `app.module.ts` |
| **Interceptors** | `interceptors/tenant-context.interceptor.ts`, `interceptors/logging.interceptor.ts`, `interceptors/transform.interceptor.ts` | Applied globally via `APP_INTERCEPTOR` in `app.module.ts` |
| **Contract Interfaces** | `interfaces/contracts/user-query.contract.ts`, `interfaces/contracts/tenant-query.contract.ts`, `interfaces/contracts/workflow-query.contract.ts`, `interfaces/contracts/workflow-execution-query.contract.ts`, `interfaces/contracts/rule-engine.contract.ts`, `interfaces/contracts/notification-template-bootstrap.contract.ts` | Binding agreements for cross-module communication |
| **Event Interfaces** | `interfaces/events/auth-events.interface.ts`, `interfaces/events/tenant-events.interface.ts`, `interfaces/events/workflow-events.interface.ts` | TypeScript type definitions for all NATS event payloads |
| **JWT Payload** | `interfaces/jwt-payload.interface.ts` | `IJwtPayload` interface: `sub`, `email`, `tenantId`, `tenantSlug`, `roles[]`, `plan`, `firstName` |
| **Middlewares** | `middlewares/logger.middleware.ts`, `middlewares/input-validate.middleware.ts` | Applied in `AppModule.configure()` |
| **Utils** | `utils/uuid.util.ts`, `utils/date.util.ts`, `utils/hashes/argon2.ts`, `utils/hashes/hash.ts`, `utils/paginaton.ts`, `utils/env.helper.ts`, `utils/env.validation.ts`, `utils/batch-processing.ts`, `utils/sleep.ts`, `utils/api/http-client.service.ts` | Pure utility functions for UUIDs, dates, Argon2 hashing, pagination, and env validation |

---

## 4. Major System Flows

### 4.1 User Registration & Authentication Flow

#### Self-Registration Into an Existing Tenant

This is the `POST /api/v1/auth/register` path, used when an employee joins an existing tenant by providing `tenantSlug`.

**Step-by-step:**

1. Client sends `{ firstName, lastName, email, password, tenantSlug }` to `POST /api/v1/auth/register`.
2. `AuthController` routes to `AuthService.register()` in `src/modules/auth/services/auth.service.ts`.
3. `AuthService` looks up the tenant by `tenantSlug` (via `TenantQueryService`, which implements `ITenantQueryContract`).
4. `AuthService` checks email uniqueness within the tenant via `UserRepository.findOne({ where: { email, tenantId } })`.
5. Password is hashed with Argon2 (12 rounds) via `libs/shared/src/utils/hashes/argon2.ts`.
6. `User` entity is persisted to the `users` table with `tenant_id`.
7. Default system roles are queried (`RoleRepository`); the user is assigned a default role in `user_roles`.
8. `AuthPublisher` publishes `NatsEvents.USER_CREATED` with `IUserCreatedEvent` payload (including `eventId`, `tenantId`, `userId`, `roles[]`, `occurredAt`).
9. JWT access token (15 min expiry) and refresh token (7 day expiry) are generated.
10. Refresh token is hashed with Argon2 and stored in `refresh_tokens` table.
11. Response: `{ accessToken, refreshToken, user: { id, email, firstName, tenantId, tenantSlug, roles } }`.

**Side effect (async):** `WorkflowExecutionModule`'s `AuthEventsSubscriber` (`src/modules/workflow-execution/subscribers/auth-events.subscriber.ts`) receives `USER_CREATED` via NATS and upserts a row into `we_user_shadows` for use in future list queries.

| Actor | Module | Action | Data In | Data Out |
|-------|--------|--------|---------|----------|
| Unauthenticated user | AuthModule | POST /auth/register | `{ firstName, lastName, email, password, tenantSlug }` | `{ accessToken, refreshToken, user }` |
| AuthModule | TenantModule (contract) | Resolve tenant by slug | `tenantSlug` | `TenantSummary` |
| AuthModule | DB | Hash + persist user | Argon2-hashed password | Saved `User` row |
| AuthModule | NATS | Publish USER_CREATED | `IUserCreatedEvent` | — |
| WorkflowExecutionModule | DB | Upsert shadow row | `IUserCreatedEvent` | `we_user_shadows` row |

#### Login

1. Client sends `{ email, password, tenantId }` to `POST /api/v1/auth/login`.
2. `AuthController` uses `LocalGuard` to invoke Passport local strategy.
3. Credentials are validated: `UserRepository` fetches user by `{ email, tenantId }`, then Argon2 hash is verified.
4. `AuthService.login()` builds the full JWT payload: `{ sub, email, tenantId, tenantSlug, roles[], plan, firstName }`.
5. Access token signed with `JWT_SECRET`, `JWT_EXPIRES_IN=15m`.
6. Refresh token generated, Argon2-hashed, stored in `refresh_tokens`.
7. `last_login_at` updated on the user row.
8. Response: `{ accessToken, refreshToken, user }`.

#### Token Refresh

1. Client sends `{ refreshToken }` to `POST /api/v1/auth/refresh`.
2. `AuthService` locates the token record by hashing the provided token and comparing against stored hashes.
3. Validates `expires_at` and `revoked_at IS NULL`.
4. **Token rotation**: old refresh token's `revoked_at` is set to `now()`.
5. New access token + new refresh token are issued and returned.

---

### 4.2 Tenant Onboarding Flow

Tenant onboarding uses `POST /api/v1/auth/register/tenant`, which is the **single-call tenant creation path**. It atomically creates the tenant, settings, default roles, and the first admin user.

**Step-by-step:**

1. Client sends `{ tenantName, tenantSlug, firstName, lastName, email, password }` to `POST /api/v1/auth/register/tenant`.
2. `OnboardingService` (`src/modules/auth/services/onboarding.service.ts`) orchestrates the flow.
3. `TenantService.create()` persists a new `Tenant` entity: `{ name, slug, plan: 'free', isActive: true }`.
4. `TenantSettings` entity is created with defaults: `{ maxWorkflowDefinitions: 10, maxUsers: 50, timezone: 'UTC' }`.
5. Default system roles are seeded into `roles` table for this tenant: `Admin`, `Approver`, `Requestor` (from `src/modules/auth/constants/default-system-roles.ts`).
6. Admin user is created with Argon2-hashed password in `users` table.
7. Admin user is assigned the `Admin` role in `user_roles`.
8. `TenantPublisher` publishes `NatsEvents.TENANT_CREATED` (`ITenantCreatedEvent`).
9. `NotificationModule`'s `NotificationSubscriber` receives `TENANT_CREATED` and sends a welcome email using the `tenant-created-welcome.pug` template.
10. JWT access token + refresh token are issued, returned to client.

| Step | Actor | Module | Table Written |
|------|-------|--------|---------------|
| 1–2 | HTTP Client | AuthModule | — |
| 3 | OnboardingService | TenantModule | `tenants` |
| 4 | OnboardingService | TenantModule | `tenant_settings` |
| 5 | OnboardingService | AuthModule | `roles` |
| 6 | OnboardingService | AuthModule | `users` |
| 7 | OnboardingService | AuthModule | `user_roles` |
| 8 | TenantPublisher | NATS | — |
| 9 | NotificationSubscriber | NotificationModule | `notification_logs` |
| 10 | AuthService | AuthModule | `refresh_tokens` |

> **Key constraint:** `tenant_id` is never sent in the request body during onboarding. The new tenant's `id` is the `tenant_id` for all subsequent rows. After onboarding, all mutations require the JWT to be present, and `tenant_id` is always extracted from `JWT.tenantId` — never from the request body.

---

### 4.3 Workflow Definition Creation Flow

This covers the full authoring lifecycle from creating a draft through publication.

**Phase A — Create Draft Definition**

1. Tenant admin sends `POST /api/v1/workflow-definitions` with `{ name, description }`.
2. `WorkflowDefinitionController` routes to `WorkflowDefinitionService.create()` in `src/modules/workflow-definition/services/workflow-definition.service.ts`.
3. `tenantId` is extracted from `@TenantId()` decorator (which reads `request.user.tenantId` from JWT).
4. `WorkflowDefinitionRepository` persists entity with `status: 'draft'`, `currentVersion: 1`.
5. Response: full definition object with `id` — client stores this `workflowDefinitionId`.

**Phase B — Add States**

1. Admin calls `POST /api/v1/workflow-definitions/:id/states` for each state (e.g., `Draft`, `Pending Approval`, `Approved`, `Rejected`).
2. `WorkflowStateService.create()` saves each `WorkflowState` entity with `workflowDefinitionId` and `tenantId`.
3. At least one state must have `isInitial: true`; at least one must have `isTerminal: true` for the definition to be publishable.
4. Client stores each returned `stateId`.

**Phase C — Add Transitions**

1. Admin calls `POST /api/v1/workflow-definitions/:id/transitions` for each transition.
2. Request body: `{ name, fromStateId, toStateId, allowedRoleIds[], requiresComment }`.
3. `WorkflowTransitionService.create()` validates that `fromStateId` and `toStateId` belong to the same definition in the same tenant (explicit tenant-scoped lookup).
4. `allowedRoleIds: []` means the transition is open to all roles.

**Phase D — Attach Rules**

1. Admin calls `POST /api/v1/workflow-definitions/:id/transitions/:transitionId/rules`.
2. Rule definition is stored as a `json-rules-engine` JSON AST in `transition_rules.rule_definition` (JSONB column).
3. Optionally includes `schemaFields[]` that accumulate into the `instance_form_schemas` table.

**Phase E — Publish**

1. Admin calls `POST /api/v1/workflow-definitions/:id/publish`.
2. `WorkflowVersionService.publish()` in `src/modules/workflow-definition/services/workflow-version.service.ts` orchestrates:
   - Loads all states for the definition (by `workflowDefinitionId`, `tenantId`)
   - Loads all transitions for the definition
   - Loads all transition rules for each transition
   - Serializes the complete tree into a `snapshot` JSONB object
   - Creates `WorkflowDefinitionVersion` record: `{ versionNumber, snapshot, isActive: true, publishedBy, publishedAt }`
   - Sets all previous versions `isActive = false`
   - Updates `workflow_definitions.status = 'published'`, `currentVersion = N`
3. `WorkflowDefinitionPublisher` publishes `NatsEvents.WORKFLOW_DEFINITION_PUBLISHED`.
4. Running instances that were created before this publish continue to use their locked version snapshot — they are unaffected by the new publish.

| Phase | API Call | Module/Service | DB Write |
|-------|----------|----------------|----------|
| A | `POST /workflow-definitions` | `WorkflowDefinitionService.create()` | `workflow_definitions` |
| B | `POST /workflow-definitions/:id/states` | `WorkflowStateService.create()` | `workflow_states` |
| C | `POST /workflow-definitions/:id/transitions` | `WorkflowTransitionService.create()` | `workflow_transitions` |
| D | `POST /workflow-definitions/:id/transitions/:id/rules` | `WorkflowTransitionService.addRule()` | `transition_rules`, `instance_form_schemas` |
| E | `POST /workflow-definitions/:id/publish` | `WorkflowVersionService.publish()` | `workflow_definition_versions`, `workflow_definitions` |

---

### 4.4 Workflow Execution Flow (trigger → completion)

This is the system's most critical path. It is implemented using CQRS in `WorkflowExecutionModule`.

**Step 1 — Create Instance**

1. User calls `POST /api/v1/workflow-instances` with `{ workflowDefinitionId, payload: {} }`.
2. `WorkflowExecutionController` dispatches `CreateInstanceCommand`.
3. `CreateInstanceHandler` (`src/modules/workflow-execution/handlers/create-instance.handler.ts`):
   - Fetches the published definition via `IWorkflowQueryContract.findDefinitionById()`.
   - Fetches the active version snapshot via `IWorkflowQueryContract.getVersionSnapshot()`.
   - Validates the definition status is `published`.
   - Identifies the `isInitial: true` state from the snapshot.
   - Persists `WorkflowInstance`: `{ workflowDefinitionId, definitionVersion, currentStateId, currentStateName, payload, status: 'active', version: 1, createdBy }`.
4. `ExecutionPublisher` publishes `NatsEvents.WORKFLOW_INSTANCE_CREATED`.
5. Response: instance object. Client stores `instanceId` and `version`.

**Step 2 — Discover Allowed Transitions**

1. User calls `GET /api/v1/workflow-instances/:id/allowed-transitions`.
2. `GetAllowedTransitionsHandler` loads the instance and its version snapshot.
3. Filters snapshot transitions where `fromStateId === instance.currentStateId`.
4. Further filters by role: only transitions whose `allowedRoleIds` includes the requesting user's role IDs (from JWT), or is empty (open to all).
5. Returns a raw array of allowed transition descriptors: `[{ id, name, toStateId, toStateName, requiresComment, allowedRoleIds }]`.
6. **Important:** this endpoint does NOT evaluate rules. Rules are only evaluated during the execute step. A listed transition may still fail at execution if its rule conditions are not met.

**Step 3 — Execute Transition**

1. User calls `POST /api/v1/workflow-instances/:id/transitions` with `{ transitionId, lastKnownVersion, comment?, idempotencyKey? }`.
2. `WorkflowExecutionController` dispatches `ExecuteTransitionCommand`.
3. `ExecuteTransitionHandler` (`src/modules/workflow-execution/handlers/execute-transition.handler.ts`) runs the following sequence:

```
a. Load instance (validate tenant_id match)
b. Load version snapshot via IWorkflowQueryContract.getVersionSnapshot()
c. Verify transition exists in snapshot FROM current state
d. Check user's role is in transition.allowedRoleIds (or list is empty)
e. If transition.requiresComment === true AND no comment provided → 422
f. Load transition's rules from snapshot
g. Build rule context:
   {
     payload: instance.payload,
     user: { id: JWT.sub, role: JWT.roles[0], roles: JWT.roles },
     instance: { currentState: instance.currentStateName, createdAt: instance.createdAt }
   }
h. Call RuleEngineService.evaluateRules(rules, context)
i. If rules fail → throw 422 with failedRules[]
j. BEGIN DB TRANSACTION:
   k. UPDATE workflow_instances
      SET current_state_id = :newStateId,
          current_state_name = :newStateName,
          version = version + 1,
          status = (newState.isTerminal ? 'completed' : 'active'),
          updated_at = now()
      WHERE id = :instanceId
        AND version = :lastKnownVersion
        AND tenant_id = :tenantId
   l. IF 0 rows updated → ROLLBACK → 409 ConflictException('TRANSITION_CONFLICT')
   m. INSERT INTO audit_logs (within same transaction — ACID guarantee)
   COMMIT TRANSACTION
n. Publish WORKFLOW_TRANSITION_COMPLETED event (after commit)
o. If newState.isTerminal: publish WORKFLOW_INSTANCE_COMPLETED
p. Return updated instance with new state + next allowed transitions
```

> **Optimistic Locking:** Step `k`–`l` is the concurrency control mechanism. If two users attempt to transition the same instance simultaneously, only the first succeeds. The second receives `409 Conflict` because the `version` no longer matches.

| Step | What Happens | Guard/Service/Handler | Outcome |
|------|-------------|----------------------|---------|
| Pre-check: auth | JWT validated | `JwtAuthGuard` | `req.user` populated |
| Pre-check: tenant | `req.user.tenantId` present | `TenantIsolationGuard` | Tenant context confirmed |
| Pre-check: RLS | DB session variable set | `DatabaseContextInterceptor` | `app.tenant_id` set in Postgres |
| Role check | Transition `allowedRoleIds` includes user's roles | `ExecuteTransitionHandler` | 403 or continue |
| Rule eval | `json-rules-engine` AST evaluated | `RuleEngineService.evaluateRules()` | 422 or continue |
| State update | Atomic UPDATE with version check | DB transaction | 409 or success |
| Audit write | `INSERT audit_logs` in same transaction | DB transaction | Guaranteed |
| Event emit | NATS publish post-commit | `ExecutionPublisher` | Async notifications triggered |

> 📐 **[DIAGRAM PLACEHOLDER]**
> *Type:* Sequence Diagram
> *Description:* Full transition execution sequence from HTTP POST through guard pipeline, rule evaluation, atomic DB transaction, NATS event publish, and notification delivery.
> *To be created separately.*

---

### 4.5 Rule Evaluation Flow

Rule evaluation is a **stateless, synchronous, in-process** operation performed by `RuleEngineModule`. It has no database tables and makes no external calls.

**Step-by-step:**

1. `ExecuteTransitionHandler` retrieves `transition_rules[]` from the version snapshot (already loaded from JSONB).
2. Each rule's `ruleDefinition` is a `json-rules-engine` JSON AST, for example:
   ```json
   {
     "all": [
       { "fact": "payload", "path": "$.days", "operator": "lessThanInclusive", "value": 7 }
     ]
   }
   ```
3. `RuleContextBuilder` (`src/modules/rule-engine/evaluators/rule-context.builder.ts`) assembles the context object:
   ```json
   {
     "payload": { "days": 5, "employeeId": "EMP-001" },
     "user": { "id": "uuid", "role": "Manager", "roles": ["Manager"] },
     "instance": { "currentState": "Pending Approval", "createdAt": "2026-01-01T00:00:00Z" }
   }
   ```
4. `ConditionEvaluator` (`src/modules/rule-engine/evaluators/condition.evaluator.ts`) wraps the `json-rules-engine` `Engine` class:
   - Registers facts: `payload`, `user`, `instance`
   - Adds the rule definition
   - Runs the engine: `engine.run(context)`
5. If all rules pass → `{ passed: true, failedRules: [] }`.
6. If any rule fails → `{ passed: false, failedRules: [{ ruleName, reason }] }`.
7. `ExecuteTransitionHandler` throws `UnprocessableEntityException` with `failedRules` if evaluation fails.

| Component | File | Role |
|-----------|------|------|
| `RuleEngineService` | `src/modules/rule-engine/services/rule-engine.service.ts` | Entry point — dispatches to evaluator |
| `ConditionEvaluator` | `src/modules/rule-engine/evaluators/condition.evaluator.ts` | Wraps `json-rules-engine` Engine |
| `CustomRuleEvaluator` | `src/modules/rule-engine/evaluators/custom-rule.evaluator.ts` | Handles `type: 'custom'` strategy rules |
| `RuleContextBuilder` | `src/modules/rule-engine/evaluators/rule-context.builder.ts` | Assembles context from instance + JWT user |
| `RuleMetadataService` | `src/modules/rule-engine/services/rule-metadata.service.ts` | Serves metadata to frontend rule builder UI |

The rule engine is explicitly **interpreted, not compiled**. Rules are JSON ASTs stored in the database. No code generation, no tenant-authored JavaScript execution. This is intentional for security: there is no code injection risk.

---

### 4.6 Audit Trail Flow

The audit trail is designed with one overriding principle: **an audit log entry is part of the transition's ACID guarantee**. If the audit write fails, the transition rolls back.

**Step-by-step:**

1. `ExecuteTransitionHandler` opens a `QueryRunner` database transaction.
2. Workflow instance state update succeeds (step `k` in §4.4).
3. Within the **same transaction**, `AuditLog` entity is inserted:
   ```
   {
     tenantId, instanceId, actorId,
     actorEmail: JWT.email,       ← SNAPSHOT (not FK)
     actorRole: JWT.roles[0],     ← SNAPSHOT (not FK)
     actionType: 'transition_executed',
     transitionId, transitionName: snapshot.transitionName,   ← SNAPSHOT
     fromState: instance.currentStateName,                    ← SNAPSHOT
     toState: newStateName,                                   ← SNAPSHOT
     comment, ipAddress, userAgent,
     eventId: UUID                ← idempotency key
   }
   ```
4. Transaction commits. Both the instance state change and the audit log are durable.
5. After commit, `ExecutionPublisher` publishes `WORKFLOW_TRANSITION_COMPLETED`.
6. `AuditSubscriber` (`src/modules/audit/subscribers/audit.subscriber.ts`) receives the NATS event and checks `eventId` uniqueness before writing any secondary audit entries — but the primary write already happened synchronously in step 3.

**Immutability enforcement:**

- `AuditLog` entity has no `updatedAt` field.
- Migration `1772830603496-Migration.ts` creates a PostgreSQL trigger: `BEFORE UPDATE OR DELETE ON audit_logs RAISE EXCEPTION` — the database itself rejects any modification or deletion of audit records.
- Snapshot fields (`actorEmail`, `actorRole`, `fromState`, `toState`, `transitionName`) are stored as strings rather than foreign keys, so they remain accurate even if the referenced user, role, or transition is later modified.

| Actor | Action | Where | Timing |
|-------|--------|-------|--------|
| `ExecuteTransitionHandler` | INSERT audit_log | Inside DB transaction | Synchronous — same TX as instance update |
| PostgreSQL trigger | BLOCK UPDATE/DELETE | Database level | Any time — immutability enforced at DB |
| `AuditSubscriber` | Idempotency check + optional secondary write | NATS consumer | Async — after event delivery |
| `AuditController` | Paginated read | `GET /instances/:id/audit-logs` | On demand — read-only |

---

## 5. Data Flow Across Layers

### 5.1 HTTP Layer → Application Layer → Domain Layer → Persistence Layer

Every inbound HTTP request traverses the following pipeline in strict order:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLIENT (Browser / API Consumer)                                            │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  MIDDLEWARE LAYER (Applied in AppModule.configure())                        │
│  1. LoggerMiddleware          — structured JSON request logging             │
│  2. EnhancedRateLimitMiddleware — per-tenant leaky bucket (Redis)           │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  GUARD LAYER (APP_GUARD, evaluated in order)                                │
│  1. ThrottlerGuard            — global fallback rate limit (memory-based)   │
│  2. JwtAuthGuard              — validates Bearer token, populates req.user  │
│  3. TenantIsolationGuard      — asserts req.user.tenantId is present        │
│  4. RolesGuard                — checks @Roles() metadata against JWT roles  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  INTERCEPTOR LAYER (APP_INTERCEPTOR, evaluated in order)                    │
│  1. ClassSerializerInterceptor — applies @Expose()/@Exclude() on responses  │
│  2. LoggingInterceptor         — logs request/response with timing          │
│  3. TenantContextInterceptor   — copies req.user.tenantId to req.tenantId   │
│  4. DatabaseContextInterceptor — calls RlsContextService.setTenantContext() │
│                                  → executes: SELECT set_config(             │
│                                      'app.tenant_id', tenantId, false)      │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  PIPE LAYER                                                                 │
│  ValidationPipe — validates and transforms request DTOs (class-validator)   │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  CONTROLLER LAYER (HTTP Layer)                                              │
│  e.g. WorkflowExecutionController.executeTransition()                       │
│  — Reads @CurrentUser(), @TenantId() from decorators (JWT, no DB call)      │
│  — Delegates to Service or CommandBus/QueryBus                              │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  APPLICATION / DOMAIN LAYER (Services / CQRS Handlers)                     │
│  e.g. ExecuteTransitionHandler                                              │
│  — Loads instance via Repository (tenant-scoped query)                      │
│  — Loads snapshot via IWorkflowQueryContract                                │
│  — Calls RuleEngineService.evaluateRules()                                  │
│  — Opens QueryRunner transaction                                            │
│  — Enforces business invariants (optimistic locking, role check, rules)     │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────────┐
│  PERSISTENCE LAYER (Repositories + TypeORM + PostgreSQL)                   │
│  — All queries carry WHERE tenant_id = :tenantId (application layer)        │
│  — PostgreSQL RLS additionally enforces: AND tenant_id = app.tenant_id      │
│  — Results returned as typed entities, never raw any                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**On response:** the response flows back through the interceptor layer in reverse, with `ClassSerializerInterceptor` transforming the entity to its DTO shape using `@Expose()` and `@Exclude()` annotations.

**On exception:** `GlobalExceptionFilter` catches all unhandled exceptions and normalizes them to:
```json
{
  "statusCode": 409,
  "errorCode": "TRANSITION_CONFLICT",
  "message": "A concurrent transition was already applied to this instance.",
  "timestamp": "2026-03-10T10:00:00.000Z",
  "path": "/api/v1/workflow-instances/uuid/transitions"
}
```

---

### 5.2 Tenant Context Propagation

Tenant context flows from the JWT through the entire request lifecycle. It is never sent by the client in the request body for security-sensitive operations.

```
JWT Payload (issued at login):
  { sub, email, tenantId, tenantSlug, roles[], plan, firstName }
           │
           ▼
JwtStrategy.validate() → populates req.user as IJwtPayload
           │
           ▼
TenantIsolationGuard → asserts req.user.tenantId is non-null
           │
           ▼
TenantContextInterceptor → req.tenantId = req.user.tenantId
           │
           ▼
DatabaseContextInterceptor → RlsContextService.setTenantContext(tenantId)
  → SELECT set_config('app.tenant_id', tenantId, false)
           │
           ▼
All DB queries: application-level WHERE tenant_id = :tenantId
           +
All DB queries: database-level RLS AND tenant_id = current_setting('app.tenant_id')::uuid
```

**Defense-in-depth:** tenant isolation is enforced at four independent layers:

| Layer | Mechanism | Bypass Impact |
|-------|-----------|---------------|
| JWT | `tenant_id` embedded in signed token | Cannot be spoofed without the JWT secret |
| `TenantIsolationGuard` | Rejects requests with missing `tenantId` | Prevents unauthenticated/broken token requests |
| Application layer | All repository queries include `WHERE tenant_id = :tenantId` | First line of code-level isolation |
| PostgreSQL RLS | `FORCE ROW LEVEL SECURITY` on all tenant-scoped tables | Last line — even a DB credential compromise cannot access cross-tenant data without the correct `app.tenant_id` session variable |

**Context cleanup:** `RlsContextService.clearTenantContext()` is called after each request to prevent context leaking across connection pool reuse.

---

## 6. Frontend Architecture

### 6.1 Frontend Module Structure

The frontend is a React 18 + Vite 5 single-page application. Its directory structure follows a feature-based organization:

```
src/
├── App.tsx                        ← Root router (react-router-dom v6)
├── main.tsx                       ← Vite entry — mounts QueryClientProvider + BrowserRouter
├── index.css                      ← Global Tailwind base styles
│
├── pages/
│   ├── auth/
│   │   ├── LoginPage.tsx          ← POST /auth/login
│   │   ├── RegisterTenantPage.tsx ← POST /auth/register/tenant
│   │   └── SelfRegisterPage.tsx   ← POST /auth/register
│   ├── DashboardPage.tsx          ← GET /dashboard/stats
│   ├── WorkflowsPage.tsx          ← GET /workflow-definitions
│   ├── WorkflowDesignerPage.tsx   ← Full authoring UI (designer store)
│   ├── InstancesPage.tsx          ← GET /workflow-instances
│   ├── InstanceDetailPage.tsx     ← GET + POST /workflow-instances/:id
│   ├── CreateInstancePage.tsx     ← POST /workflow-instances
│   ├── UsersPage.tsx              ← GET/POST /users
│   ├── RolesPage.tsx              ← GET/POST /roles
│   ├── NotificationsPage.tsx      ← GET/POST /notification-templates
│   ├── WebhooksPage.tsx           ← GET/POST /webhook-configs
│   ├── SettingsPage.tsx           ← GET/PATCH /tenants/me/settings
│   └── PricingPage.tsx            ← Static pricing page
│
├── components/
│   ├── auth/
│   │   ├── ProtectedRoute.tsx     ← Redirects to /login if not authenticated
│   │   └── AdminRoute.tsx         ← Redirects if user lacks Admin role
│   ├── common/
│   │   ├── DataTable.tsx          ← TanStack Table wrapper
│   │   ├── LoadingSpinner.tsx
│   │   ├── PageHeader.tsx
│   │   ├── StatusBadge.tsx        ← Color-coded status pills (active/completed/cancelled)
│   │   ├── EmptyState.tsx
│   │   ├── ErrorMessage.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── CopyableId.tsx
│   │   └── ThemeToggle.tsx
│   ├── layout/
│   │   ├── AppShell.tsx           ← Wraps all authenticated pages with Sidebar + Topbar
│   │   ├── Sidebar.tsx            ← Navigation links via NavLink.tsx
│   │   └── Topbar.tsx             ← User avatar, logout, tenant name
│   └── ui/                        ← shadcn/ui components (Radix primitives)
│
├── stores/
│   ├── auth-store.ts              ← Zustand (persisted to localStorage as "flowforge-auth")
│   └── workflow-designer-store.ts ← Zustand (in-memory, reset on navigation away)
│
├── lib/
│   ├── api-client.ts              ← Axios instance with JWT + CSRF interceptors
│   ├── api-helpers.ts             ← Typed wrapper functions over apiClient
│   ├── query-client.ts            ← TanStack QueryClient configuration
│   └── query-keys.ts              ← Centralized cache key factories
│
├── types/
│   └── api.ts                     ← TypeScript interfaces for all API response types
│
└── utils/
    ├── error-messages.ts          ← Maps API error codes to user-facing messages
    ├── format-date.ts             ← date-fns wrappers
    └── jwt.ts                     ← JWT decode utility
```

---

### 6.2 State Management Strategy (Zustand + TanStack Query)

The frontend uses a **two-store, two-cache architecture** that separates concerns cleanly:

| Concern | Tool | Persistence | Scope |
|---------|------|-------------|-------|
| Auth session (tokens, user) | **Zustand** (`auth-store.ts`) | `localStorage` via `zustand/middleware/persist` | Global, survives page reload |
| Workflow designer editing state | **Zustand** (`workflow-designer-store.ts`) | In-memory only | Page-scoped, `reset()` on unmount |
| All server data (API responses) | **TanStack Query** | In-memory React Query cache | Automatic stale/refetch/invalidation |
| Mutations (POST/PATCH/DELETE) | **TanStack Query `useMutation`** | n/a | On-demand, triggers cache invalidation |

**`auth-store.ts` — Zustand Auth Store**

Defined in `src/stores/auth-store.ts`. Holds:
- `accessToken: string | null`
- `refreshToken: string | null`
- `user: AuthUser | null` (typed with `id`, `email`, `firstName`, `tenantId`, `tenantSlug`, `roles[]`, `roleIds[]`, `plan`)
- `isAuthenticated: boolean`
- Actions: `setSession()`, `setTokens()`, `logout()`

The store is persisted under the key `"flowforge-auth"`. Partial persistence: only `accessToken`, `refreshToken`, `user`, and `isAuthenticated` are serialized — no sensitive computed state.

**`workflow-designer-store.ts` — Zustand Designer Store**

Defined in `src/stores/workflow-designer-store.ts`. Holds the full designer editing context:
- `definitionId`, `definitionName`, `definitionStatus`
- `states: WorkflowState[]`
- `transitions: WorkflowTransition[]`
- `rules: Record<transitionId, TransitionRule[]>`
- `formSchema: FormSchemaField[]`
- `ruleMetadata: RuleMetadata | null`
- `selectedStateId`, `selectedTransitionId`
- Actions: `setDefinition()`, `setStates()`, `setTransitions()`, `setRulesForTransition()`, `setFormSchema()`, `setRuleMetadata()`, `setSelectedState()`, `setSelectedTransition()`, `reset()`

This store acts as the single source of truth for the `WorkflowDesignerPage`. TanStack Query fetches are written into this store so the visual designer canvas can render reactively.

**TanStack Query Cache Keys**

Defined in `src/lib/query-keys.ts`. All keys are factory functions returning `readonly` tuples:

| Resource | Key Factory | Example |
|----------|-------------|---------|
| Auth current user | `queryKeys.auth.me()` | `["auth", "me"]` |
| User list | `queryKeys.users.list(params)` | `["users", "list", { page: 1 }]` |
| Workflow definition detail | `queryKeys.workflowDefinitions.detail(id)` | `["workflow-definitions", "uuid"]` |
| Instance allowed transitions | `queryKeys.workflowInstances.allowedTransitions(id)` | `["workflow-instances", "uuid", "allowed-transitions"]` |
| Audit logs | `queryKeys.workflowInstances.auditLogs(id, params)` | `["workflow-instances", "uuid", "audit-logs", { page: 1 }]` |

Cache invalidation strategy: after any mutation (e.g., executing a transition), the mutation's `onSuccess` callback calls `queryClient.invalidateQueries(queryKeys.workflowInstances.detail(id))` and `queryClient.invalidateQueries(queryKeys.workflowInstances.allowedTransitions(id))` to force a refetch of the updated instance state and the new set of allowed transitions.

---

### 6.3 API Integration Pattern

**Axios Instance (`src/lib/api-client.ts`)**

A single `apiClient` Axios instance is created with `baseURL = VITE_API_BASE_URL`. All API calls go through this instance to benefit from the two interceptors:

**Request Interceptor (attach JWT + CSRF):**
1. Reads `accessToken` from `useAuthStore.getState().accessToken`.
2. Sets `Authorization: Bearer <token>` header.
3. For mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`): calls `GET /api/v1/csrf-token` to obtain a CSRF token, then sets `X-CSRF-Token: <token>` header.

**Response Interceptor (auto token refresh on 401):**
1. If response status is `401` and the request is not the refresh call itself:
   - Reads `refreshToken` from `useAuthStore.getState().refreshToken`.
   - Calls `POST /api/v1/auth/refresh` with the refresh token.
   - On success: calls `useAuthStore.getState().setTokens(newAccess, newRefresh)`.
   - Retries the original failed request with the new `accessToken`.
2. If the refresh itself fails: calls `useAuthStore.getState().logout()` and redirects to `/login`.

**CSRF Flow:**

The backend uses `csurf` middleware. The frontend uses a dedicated `csrfClient` (separate Axios instance with `withCredentials: true`) to fetch the CSRF token. The CSRF secret cookie is `httpOnly` so JavaScript cannot read it; the frontend only uses the token value returned in the response body. In production (hosted environments), the CSRF cookie is `SameSite=None; Secure`.

**Request Pattern:**

All pages use TanStack Query hooks. A standard read operation looks like:

```typescript
// In InstanceDetailPage.tsx
const { data, isLoading } = useQuery({
  queryKey: queryKeys.workflowInstances.detail(instanceId),
  queryFn: () => apiClient.get(`/api/v1/workflow-instances/${instanceId}`).then(r => r.data.data),
});
```

A standard mutation:

```typescript
const mutation = useMutation({
  mutationFn: (body: ExecuteTransitionDto) =>
    apiClient.post(`/api/v1/workflow-instances/${id}/transitions`, body).then(r => r.data.data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workflowInstances.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.workflowInstances.allowedTransitions(id) });
  },
});
```

**Route Protection:**

- `ProtectedRoute` (`src/components/auth/ProtectedRoute.tsx`) wraps all authenticated routes. It reads `isAuthenticated` from `useAuthStore`. If `false`, it redirects to `/login`.
- `AdminRoute` (`src/components/auth/AdminRoute.tsx`) additionally checks `user.roles.includes('Admin')` and redirects to the dashboard if the user lacks admin access.

> 📐 **[DIAGRAM PLACEHOLDER]**
> *Type:* Frontend Component Hierarchy Diagram
> *Description:* Shows the React component tree from `App.tsx` through `AppShell` to page components, with Zustand stores and TanStack Query cache shown as data providers.
> *To be created separately.*

---

*End of 02-HIGH-LEVEL-DESIGN.md*
