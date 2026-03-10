---
title: Low Level Design
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# Low Level Design

This document describes the internal structure, classes, data structures, and patterns used in the Workflow Engine codebase, focusing on how each module is implemented and how they collaborate at a code level.

## Table of Contents

- [Low Level Design](#low-level-design)
  - [Table of Contents](#table-of-contents)
  - [1. Overview](#1-overview)
  - [2. Backend Module Deep Dives](#2-backend-module-deep-dives)
    - [2.1 `auth` Module](#21-auth-module)
      - [2.1.1 Responsibility](#211-responsibility)
      - [2.1.2 Key Classes / Services (with file paths)](#212-key-classes--services-with-file-paths)
      - [2.1.3 Contracts Exposed](#213-contracts-exposed)
      - [2.1.4 Contracts Consumed](#214-contracts-consumed)
      - [2.1.5 Internal Data Flow](#215-internal-data-flow)
      - [2.1.6 Key Algorithms / Business Logic](#216-key-algorithms--business-logic)
    - [2.2 `tenant` Module](#22-tenant-module)
      - [2.2.1 Responsibility](#221-responsibility)
      - [2.2.2 Key Classes / Services](#222-key-classes--services)
      - [2.2.3 Contracts Exposed](#223-contracts-exposed)
      - [2.2.4 Contracts Consumed](#224-contracts-consumed)
      - [2.2.5 Internal Data Flow](#225-internal-data-flow)
    - [2.3 `workflow-definition` Module](#23-workflow-definition-module)
      - [2.3.1 Responsibility](#231-responsibility)
      - [2.3.2 Key Classes / Services](#232-key-classes--services)
      - [2.3.3 Contracts Exposed](#233-contracts-exposed)
      - [2.3.4 Contracts Consumed](#234-contracts-consumed)
      - [2.3.5 Internal Data Flow](#235-internal-data-flow)
    - [2.4 `workflow-execution` Module](#24-workflow-execution-module)
      - [2.4.1 Responsibility](#241-responsibility)
      - [2.4.2 Key Classes / Services](#242-key-classes--services)
      - [2.4.3 Contracts Exposed](#243-contracts-exposed)
      - [2.4.4 Contracts Consumed](#244-contracts-consumed)
      - [2.4.5 Internal Data Flow](#245-internal-data-flow)
    - [2.5 `rule-engine` Module](#25-rule-engine-module)
    - [2.6 `audit` Module](#26-audit-module)
    - [2.7 `notification` Module](#27-notification-module)
    - [2.8 `database` Module](#28-database-module)
    - [2.9 `health` Module](#29-health-module)
    - [2.10 `dashboard` Module](#210-dashboard-module)
  - [3. Design Patterns Catalogue](#3-design-patterns-catalogue)
  - [4. Common / Shared Layer](#4-common--shared-layer)
    - [4.1 Decorators](#41-decorators)
    - [4.2 Guards](#42-guards)
    - [4.3 Pipes / Interceptors](#43-pipes--interceptors)
    - [4.4 Contracts / Interfaces](#44-contracts--interfaces)
  - [5. Workflow Execution Engine — Deep Dive](#5-workflow-execution-engine--deep-dive)
    - [5.1 State Machine Design](#51-state-machine-design)
    - [5.2 Rule Evaluation (`json-rules-engine` Integration)](#52-rule-evaluation-json-rules-engine-integration)
    - [5.3 Immutable Snapshot Strategy](#53-immutable-snapshot-strategy)
    - [5.4 Execution Context Design](#54-execution-context-design)
  - [6. Database Schema (detailed)](#6-database-schema-detailed)
    - [6.1 TypeORM Entity Class Catalogue (table: entity, file path, table name)](#61-typeorm-entity-class-catalogue-table-entity-file-path-table-name)
    - [6.2 Key Entity Relationships](#62-key-entity-relationships)
  - [7. Error Handling Strategy](#7-error-handling-strategy)
    - [7.1 Exception Hierarchy](#71-exception-hierarchy)
    - [7.2 Global Exception Filter](#72-global-exception-filter)
    - [7.3 Domain Error vs HTTP Error Mapping](#73-domain-error-vs-http-error-mapping)
  - [8. Frontend Low Level Design](#8-frontend-low-level-design)
    - [8.1 Component Architecture](#81-component-architecture)
    - [8.2 Hook Patterns](#82-hook-patterns)
    - [8.3 API Client Design (TanStack Query setup)](#83-api-client-design-tanstack-query-setup)
    - [8.4 Zustand Store Design](#84-zustand-store-design)
  - [9. Dependencies & Versions](#9-dependencies--versions)
    - [9.1 Backend Dependencies](#91-backend-dependencies)
    - [9.2 Frontend Dependencies](#92-frontend-dependencies)
  - [10. Embedded Reference Sections](#10-embedded-reference-sections)
    - [10.1 Section 1: Microservice-Extractable Contract-First Modular Monolith](#101-section-1-microservice-extractable-contract-first-modular-monolith)
    - [10.2 Section 2: API Architecture Pattern](#102-section-2-api-architecture-pattern)
    - [10.3 Section 3: Microservice Design Patterns Catalogue](#103-section-3-microservice-design-patterns-catalogue)
    - [10.4 Section 4: Database Design](#104-section-4-database-design)
    - [10.5 Section 5: Scalability Considerations](#105-section-5-scalability-considerations)
    - [10.6 Section 6: REFERENCES (Monolith vs Microservices, SQL vs NoSQL, Database Design)](#106-section-6-references-monolith-vs-microservices-sql-vs-nosql-database-design)
    - [10.7 Section 7: Rule Engine Mental Picture](#107-section-7-rule-engine-mental-picture)
    - [10.8 Section 8: Business Point of View](#108-section-8-business-point-of-view)
    - [10.9 Section 9: Actors and Personas](#109-section-9-actors-and-personas)
    - [10.10 Section 10: Foundation](#1010-section-10-foundation)
    - [10.11 Section 11: Tenancy Models Available and Recommendation](#1011-section-11-tenancy-models-available-and-recommendation)
    - [10.12 Section 12: Workflow Execution Model](#1012-section-12-workflow-execution-model)

---

## 1. Overview

The Workflow Engine backend is a NestJS modular monolith with strict module boundaries, contract-based inter-module communication, and a database schema designed for microservice extraction. The low level design centers around:

- explicit repository abstractions with no cross-module ORM relations,
- contract interfaces (`USER_QUERY_CONTRACT`, `TENANT_QUERY_CONTRACT`, `WORKFLOW_QUERY_CONTRACT`, `WORKFLOW_EXECUTION_QUERY_CONTRACT`, `RULE_ENGINE_CONTRACT`),
- CQRS for workflow execution,
- PostgreSQL with JSONB for workflow payloads and rule ASTs,
- Redis-backed caching and tenant-aware RLS enforced in PostgreSQL.

The frontend is a React + Vite SPA using TanStack Query for server state and Zustand for auth/session state, mapping closely onto backend API contracts.

---

## 2. Backend Module Deep Dives

For each backend module, this section captures responsibility, key classes, contracts, internal data flow, and notable algorithms.

### 2.1 `auth` Module

#### 2.1.1 Responsibility

The `auth` module provides identity, authentication, and RBAC:

- tenant-scoped users, roles, and role assignments,
- Argon2-based credential verification,
- JWT access tokens and opaque refresh tokens,
- user and tenant onboarding flows,
- user-facing management APIs (`/auth/*`, `/users`, `/roles`),
- NATS domain events for user lifecycle.

#### 2.1.2 Key Classes / Services (with file paths)

| Type        | Name / Description           | File Path                                                    |
| ----------- | ---------------------------- | ------------------------------------------------------------ |
| Entity      | `User`                       | `src/modules/auth/entities/user.entity.ts`                   |
| Entity      | `Role`                       | `src/modules/auth/entities/role.entity.ts`                   |
| Entity      | `Permission`                 | `src/modules/auth/entities/permission.entity.ts`             |
| Entity      | `UserRole`                   | `src/modules/auth/entities/user-role.entity.ts`              |
| Entity      | `RefreshToken`               | `src/modules/auth/entities/refresh-token.entity.ts`          |
| Repository  | `UserRepository`             | `src/modules/auth/repositories/user.repository.ts`           |
| Repository  | `RoleRepository`             | `src/modules/auth/repositories/role.repository.ts`           |
| Repository  | `RefreshTokenRepository`     | `src/modules/auth/repositories/refresh-token.repository.ts`  |
| Service     | `AuthService`                | `src/modules/auth/services/auth.service.ts`                  |
| Service     | `UserService`                | `src/modules/auth/services/user.service.ts`                  |
| Service     | `RoleService`                | `src/modules/auth/services/role.service.ts`                  |
| Service     | `UserQueryService`           | `src/modules/auth/services/user-query.service.ts`            |
| Service     | `OnboardingService`          | `src/modules/auth/services/onboarding.service.ts`            |
| Service     | `RefreshTokenCleanupService` | `src/modules/auth/services/refresh-token-cleanup.service.ts` |
| Publisher   | `AuthPublisher`              | `src/modules/auth/publishers/auth.publisher.ts`              |
| Strategy    | `JwtStrategy`                | `src/modules/auth/strategies/jwt.strategy.ts`                |
| Controller  | `AuthController`             | `src/modules/auth/controllers/auth.controller.ts`            |
| Controller  | `UserController`             | `src/modules/auth/controllers/user.controller.ts`            |
| Controller  | `RoleController`             | `src/modules/auth/controllers/role.controller.ts`            |
| Controller  | `CsrfController`             | `src/modules/auth/controllers/csrf.controller.ts`            |
| Nest Module | `AuthModule`                 | `src/modules/auth/auth.module.ts`                            |

#### 2.1.3 Contracts Exposed

- `USER_QUERY_CONTRACT` (`libs/shared/src/interfaces/contracts/user-query.contract.ts`)
  - Implemented by `UserQueryService`.
  - Exported from `AuthModule`:

  ```ts
  providers: [
    UserQueryService,
    { provide: USER_QUERY_CONTRACT, useClass: UserQueryService },
  ],
  exports: [USER_QUERY_CONTRACT],
  ```

This contract exposes read-only `UserSummary` data (no passwords, no internal relations) to other modules, keeping cross-module coupling at the interface level.

#### 2.1.4 Contracts Consumed

- `TENANT_QUERY_CONTRACT` in `AuthService`:

```ts
constructor(
  private readonly userRepository: UserRepository,
  private readonly refreshTokenRepository: RefreshTokenRepository,
  @Inject(TENANT_QUERY_CONTRACT)
  private readonly tenantQuery: ITenantQueryContract,
  private readonly jwtService: JwtService,
  private readonly configService: ConfigService
) {}
```

The authentication flow uses this to fetch tenant metadata (slug, plan) when issuing tokens, ensuring tenant-aware JWTs.

#### 2.1.5 Internal Data Flow

- **Tenant registration (`POST /auth/register/tenant`)**
  - `AuthController.registerTenant` → `OnboardingService.registerTenant`.
  - Creates tenant, tenant settings, default roles, first admin user, and returns `{ accessToken, refreshToken, user, tenant }`.

- **User self-registration (`POST /auth/register`)**
  - Uses `tenantSlug` to resolve tenant via `TenantQueryService.findBySlug`.
  - Creates a `User` with default system role(s), issues token pair.

- **Login (`POST /auth/login`)**
  - `AuthController.login` → `AuthService.login(LoginDto)`:
    - `UserRepository.findByEmailAndTenant(email, tenantId)`.
    - `argon2verify(user.passwordHash, password)`.
    - `UserRepository.findByIdWithRoles(user.id, tenantId)` to hydrate `userRoles`.
    - `TenantQueryService.findById(tenantId)` to get slug and plan.
    - `AuthService.issueTokenPair(...)` to create JWT + hashed refresh token row.

- **Token refresh (`POST /auth/refresh`)**
  - Parses `refreshToken` from body.
  - Hashes with SHA256 and finds `RefreshToken` row via repository.
  - Checks expiration; revokes old token; fetches user + roles; issues new pair.

- **User management (`/users`)**
  - `UserController` delegates to `UserService` methods for:
    - paginated `findAll` with `FindUserDto` (`page`, `limit`),
    - `findById` including role assignments,
    - `create` with Argon2 hashing and optional initial roles,
    - `deactivate` which sets `isActive = false`, revokes caches, and publishes `USER_DEACTIVATED`,
    - `assignRole` which guards duplicates and publishes `USER_ROLES_UPDATED`.

- **Role management (`/roles`)**
  - `RoleController` uses `RoleService` to list tenant roles and create custom roles for the tenant.

#### 2.1.6 Key Algorithms / Business Logic

- **Argon2 Password Hashing**
  - At user creation or onboarding, plain-text `password` is hashed via `argon2hash`.
  - At login, `argon2verify` ensures credentials are correct.
  - Decision → Alternatives:

    | Option | Pros                                             | Cons                                |
    | ------ | ------------------------------------------------ | ----------------------------------- |
    | Argon2 | Memory-hard, PHC winner, modern security profile | Slightly higher resource cost       |
    | Bcrypt | Very common, widely supported                    | Less tunable, weaker vs GPU attacks |
    | Scrypt | Memory-hard                                      | Less widely used in Node ecosystem  |

  - **Why chosen**: stronger security, forward-looking; cost slightly higher but acceptable for SaaS login workloads.

- **JWT Payload Design**
  - Contains: `sub`, `email`, `firstName`, `tenantId`, `tenantSlug`, `roles`, `roleIds`, `plan`.
  - Chosen to support cross-module data needs via Pattern 1 (JWT claims) without extra DB lookups.

- **Refresh Token Rotation**
  - Refresh tokens are opaque UUIDs stored hashed in `refresh_tokens`.
  - Every refresh revokes the used token and creates a new one, reducing replay window and supporting revocation.

---

### 2.2 `tenant` Module

#### 2.2.1 Responsibility

The `tenant` module owns the tenant aggregate and its configuration:

- tenant master data (`tenants`),
- per-tenant settings (`tenant_settings`),
- per-tenant feature flags (`tenant_feature_flags`),
- tenant-facing admin APIs,
- domain events for tenant lifecycle.

#### 2.2.2 Key Classes / Services

| Type        | Name / Description            | File Path                                                           |
| ----------- | ----------------------------- | ------------------------------------------------------------------- |
| Entity      | `Tenant`                      | `src/modules/tenant/entities/tenant.entity.ts`                      |
| Entity      | `TenantSettings`              | `src/modules/tenant/entities/tenant-settings.entity.ts`             |
| Entity      | `TenantFeatureFlag`           | `src/modules/tenant/entities/tenant-feature-flag.entity.ts`         |
| Repository  | `TenantRepository`            | `src/modules/tenant/repositories/tenant.repository.ts`              |
| Repository  | `TenantSettingsRepository`    | `src/modules/tenant/repositories/tenant-settings.repository.ts`     |
| Repository  | `TenantFeatureFlagRepository` | `src/modules/tenant/repositories/tenant-feature-flag.repository.ts` |
| Service     | `TenantService`               | `src/modules/tenant/services/tenant.service.ts`                     |
| Service     | `TenantQueryService`          | `src/modules/tenant/services/tenant-query.service.ts`               |
| Service     | `TenantProvisioningService`   | `src/modules/tenant/services/tenant-provisioning.service.ts`        |
| Publisher   | `TenantPublisher`             | `src/modules/tenant/publishers/tenant.publisher.ts`                 |
| Controller  | `TenantController`            | `src/modules/tenant/controllers/tenant.controller.ts`               |
| Nest Module | `TenantModule`                | `src/modules/tenant/tenant.module.ts`                               |

#### 2.2.3 Contracts Exposed

- `TENANT_QUERY_CONTRACT` → `TenantQueryService`
- `TENANT_PROVISIONING_CONTRACT` → `TenantProvisioningService`

These abstractions are used by onboarding and other contexts that need tenant info without tying directly to entities or repositories.

#### 2.2.4 Contracts Consumed

- None (tenant is effectively a root context from a data perspective).

#### 2.2.5 Internal Data Flow

- `TenantController` delegates to `TenantService` for:
  - super-admin tenant listing (`findAll`),
  - retrieving individual tenants (`findById`),
  - updating and deactivating tenants with `verifyUserBelongsToTenant` guard,
  - reading and updating settings and feature flags.

- `TenantQueryService`:
  - `findById` / `findBySlug`:
    - caches `TenantSummary` in Redis (`CacheKeys.tenantById`, `CacheKeys.tenantBySlug`),
  - `isFeatureEnabled`:
    - loads all flags, builds map `{[flagKey]: isEnabled}`, caches under `CacheKeys.tenantFeatureFlags`,
  - `getPlan`:
    - reads plan and caches under `CacheKeys.tenantPlan`.

- Events:
  - On creation and updates, `TenantPublisher` emits events consumed by audit and other subscribers.

---

### 2.3 `workflow-definition` Module

#### 2.3.1 Responsibility

The `workflow-definition` module provides design-time modeling:

- workflow definitions (name, description, status, versioning),
- states (initial/terminal, positions, metadata),
- transitions (from → to, allowed roles, comment requirements),
- transition rules (JSON rule AST for `json-rules-engine`),
- instance form schema derived from rule-driven `schemaFields`,
- versioning via immutable snapshots of definition aggregates.

#### 2.3.2 Key Classes / Services

| Type        | Name / Description             | File Path                                                                         |
| ----------- | ------------------------------ | --------------------------------------------------------------------------------- |
| Entity      | `WorkflowDefinition`           | `src/modules/workflow-definition/entities/workflow-definition.entity.ts`          |
| Entity      | `WorkflowDefinitionVersion`    | `src/modules/workflow-definition/entities/workflow-definition-version.entity.ts`  |
| Entity      | `WorkflowState`                | `src/modules/workflow-definition/entities/workflow-state.entity.ts`               |
| Entity      | `WorkflowTransition`           | `src/modules/workflow-definition/entities/workflow-transition.entity.ts`          |
| Entity      | `TransitionRule`               | `src/modules/workflow-definition/entities/transition-rule.entity.ts`              |
| Entity      | `InstanceFormSchema`           | `src/modules/workflow-definition/entities/instance-form-schema.entity.ts`         |
| Repository  | `WorkflowDefinitionRepository` | `src/modules/workflow-definition/repositories/workflow-definition.repository.ts`  |
| Repository  | `WorkflowVersionRepository`    | `src/modules/workflow-definition/repositories/workflow-version.repository.ts`     |
| Repository  | `WorkflowStateRepository`      | `src/modules/workflow-definition/repositories/workflow-state.repository.ts`       |
| Repository  | `WorkflowTransitionRepository` | `src/modules/workflow-definition/repositories/workflow-transition.repository.ts`  |
| Repository  | `TransitionRuleRepository`     | `src/modules/workflow-definition/repositories/transition-rule.repository.ts`      |
| Repository  | `InstanceFormSchemaRepository` | `src/modules/workflow-definition/repositories/instance-form-schema.repository.ts` |
| Service     | `WorkflowDefinitionService`    | `src/modules/workflow-definition/services/workflow-definition.service.ts`         |
| Service     | `WorkflowVersionService`       | `src/modules/workflow-definition/services/workflow-version.service.ts`            |
| Service     | `WorkflowStateService`         | `src/modules/workflow-definition/services/workflow-state.service.ts`              |
| Service     | `WorkflowTransitionService`    | `src/modules/workflow-definition/services/workflow-transition.service.ts`         |
| Service     | `WorkflowQueryService`         | `src/modules/workflow-definition/services/workflow-query.service.ts`              |
| Publisher   | `WorkflowDefinitionPublisher`  | `src/modules/workflow-definition/publishers/workflow-definition.publisher.ts`     |
| Controller  | `WorkflowDefinitionController` | `src/modules/workflow-definition/controllers/workflow-definition.controller.ts`   |
| Controller  | `WorkflowStateController`      | `src/modules/workflow-definition/controllers/workflow-state.controller.ts`        |
| Controller  | `WorkflowTransitionController` | `src/modules/workflow-definition/controllers/workflow-transition.controller.ts`   |
| Nest Module | `WorkflowDefinitionModule`     | `src/modules/workflow-definition/workflow-definition.module.ts`                   |

#### 2.3.3 Contracts Exposed

- `WORKFLOW_QUERY_CONTRACT` → `WorkflowQueryService`

This exposes:

- `findDefinitionById(definitionId, tenantId)` → `WorkflowDefinitionSummary`,
- `getVersionSnapshot(definitionId, version, tenantId)` → `snapshot JSON`,
- `getInstanceFormSchema(definitionId, tenantId)` → normalized `WorkflowInstanceFormSchema`,
- `countDefinitionsByTenant` and `countPublishedDefinitionsByTenant`.

#### 2.3.4 Contracts Consumed

- None; workflow-definition is upstream for workflow-execution and does not import other domain services.

#### 2.3.5 Internal Data Flow

- **Definition creation**
  - `WorkflowDefinitionController.create` → `WorkflowDefinitionService.create`.
  - Creates a DRAFT definition with `currentVersion = 1`, invalidates definition-list cache.

- **State creation & updates**
  - `WorkflowStateService.create`:
    - Ensures definition exists and is DRAFT.
    - Enforces exactly one initial state via `countInitialStates`.
    - Creates state row and invalidates caches for definition, states, and definitions list.
  - `WorkflowStateService.update`:
    - Guards status and invariants; prevents removing the only initial state.

- **Transition and rule creation**
  - `WorkflowTransitionService` and `TransitionRuleRepository` manage transitions and associated JSON AST rules.
  - Rules optionally contribute `schemaFields` that are merged into `InstanceFormSchema`.

- **Publishing definitions**
  - `WorkflowDefinitionService.publish`:
    - Validates status (not deprecated).
    - Delegates to `WorkflowVersionService.publish` to:
      - fetch states, transitions, rules,
      - build `snapshot` object,
      - create `WorkflowDefinitionVersion`,
      - flip `isActive` flags, update `currentVersion` and `status = published`,
      - emit `WORKFLOW_DEFINITION_PUBLISHED`.

- **Instance form schema**
  - `InstanceFormSchemaRepository` stores raw JSON.
  - Both `WorkflowDefinitionService` and `WorkflowQueryService` have `normalizeInstanceFormSchema` helpers that:
    - extract `fields` array defensively,
    - filter to `WorkflowInstanceFormField`-shaped objects,
    - return normalized `WorkflowInstanceFormSchema`,
    - cache results with long TTL.

---

### 2.4 `workflow-execution` Module

#### 2.4.1 Responsibility

The `workflow-execution` module implements runtime instance lifecycle:

- creating instances from published definition versions,
- determining allowed transitions for a user,
- executing transitions with rule evaluation, optimistic locking, and audit logging,
- canceling instances,
- providing query-side views for detail and lists.

#### 2.4.2 Key Classes / Services

| Type        | Name / Description              | File Path                                                                     |
| ----------- | ------------------------------- | ----------------------------------------------------------------------------- |
| Entity      | `WorkflowInstance`              | `src/modules/workflow-execution/entities/workflow-instance.entity.ts`         |
| Entity      | `WeUserShadow`                  | `src/modules/workflow-execution/entities/we-user-shadow.entity.ts`            |
| Repository  | `WorkflowInstanceRepository`    | `src/modules/workflow-execution/repositories/workflow-instance.repository.ts` |
| Repository  | `UserShadowRepository`          | `src/modules/workflow-execution/repositories/user-shadow.repository.ts`       |
| Command     | `CreateInstanceCommand`         | `src/modules/workflow-execution/commands/create-instance.command.ts`          |
| Command     | `ExecuteTransitionCommand`      | `src/modules/workflow-execution/commands/execute-transition.command.ts`       |
| Command     | `CancelInstanceCommand`         | `src/modules/workflow-execution/commands/cancel-instance.command.ts`          |
| Cmd Handler | `CreateInstanceHandler`         | `src/modules/workflow-execution/handlers/create-instance.handler.ts`          |
| Cmd Handler | `ExecuteTransitionHandler`      | `src/modules/workflow-execution/handlers/execute-transition.handler.ts`       |
| Cmd Handler | `CancelInstanceHandler`         | `src/modules/workflow-execution/handlers/cancel-instance.handler.ts`          |
| Query       | `GetInstanceDetailQuery`        | `src/modules/workflow-execution/queries/get-instance-detail.query.ts`         |
| Query       | `GetInstanceListQuery`          | `src/modules/workflow-execution/queries/get-instance-list.query.ts`           |
| Query       | `GetAllowedTransitionsQuery`    | `src/modules/workflow-execution/queries/get-allowed-transitions.query.ts`     |
| Query Hdlr  | `GetInstanceDetailHandler`      | `src/modules/workflow-execution/handlers/get-instance-detail.handler.ts`      |
| Query Hdlr  | `GetInstanceListHandler`        | `src/modules/workflow-execution/handlers/get-instance-list.handler.ts`        |
| Query Hdlr  | `GetAllowedTransitionsHandler`  | `src/modules/workflow-execution/handlers/get-allowed-transitions.handler.ts`  |
| Service     | `WorkflowExecutionService`      | `src/modules/workflow-execution/services/workflow-execution.service.ts`       |
| Service     | `WorkflowExecutionQueryService` | `src/modules/workflow-execution/services/workflow-execution-query.service.ts` |
| Service     | `TransitionExecutorService`     | `src/modules/workflow-execution/services/transition-executor.service.ts`      |
| Publisher   | `ExecutionPublisher`            | `src/modules/workflow-execution/publishers/execution.publisher.ts`            |
| Subscriber  | `AuthEventsSubscriber`          | `src/modules/workflow-execution/subscribers/auth-events.subscriber.ts`        |
| Controller  | `WorkflowExecutionController`   | `src/modules/workflow-execution/controllers/workflow-execution.controller.ts` |
| Nest Module | `WorkflowExecutionModule`       | `src/modules/workflow-execution/workflow-execution.module.ts`                 |

#### 2.4.3 Contracts Exposed

- `WORKFLOW_EXECUTION_QUERY_CONTRACT` → `WorkflowExecutionQueryService` (read-side contract for instances).

#### 2.4.4 Contracts Consumed

- `WORKFLOW_QUERY_CONTRACT` for snapshots and metadata.
- `RULE_ENGINE_CONTRACT` for evaluating transition rules.
- NATS events from `auth` (via `AuthEventsSubscriber`) to maintain `WeUserShadow`.

#### 2.4.5 Internal Data Flow

- **Instance creation**
  - `WorkflowExecutionController.createInstance` → `WorkflowExecutionService.createInstance` → `CreateInstanceCommand`.
  - Handler:
    - uses `WORKFLOW_QUERY_CONTRACT` to fetch published definition snapshot,
    - determines initial state from snapshot,
    - constructs `WorkflowInstance` with `definitionVersion`, `current_state_id`, `payload`, `status = active`, `version = 1`,
    - saves instance and emits `WORKFLOW_INSTANCE_CREATED`.

- **Allowed transitions**
  - `GET /instances/:id/allowed-transitions`:
    - uses query handler to load instance and snapshot,
    - filters transitions in snapshot where `fromStateId == currentStateId` and `allowedRoleIds` intersect user’s `roleIds` (or array is empty),
    - returns array of transitions with `requiresComment` and `toStateName`.

- **Transition execution**
  - `WorkflowExecutionController.executeTransition` → `WorkflowExecutionService.executeTransition` → `ExecuteTransitionCommand`.
  - Handler orchestrates:
    - instance load with tenant check,
    - snapshot load via `WORKFLOW_QUERY_CONTRACT`,
    - permission checks on `allowedRoleIds`,
    - `RuleEngineService.evaluateRules` for all `TransitionRule` ASTs,
    - DB transaction to:
      - `UPDATE workflow_instances` with `WHERE id = :id AND version = :lastKnownVersion AND tenant_id = :tenantId`,
      - update state, name, status, increment version,
      - write audit entry in `audit_logs`,
    - emit NATS events for completion / cancellation.

- **User shadow synchronization**
  - `AuthEventsSubscriber` handles:
    - `USER_CREATED` → `upsert` `WeUserShadow`,
    - `USER_DEACTIVATED` → sets `isActive = false`,
    - `USER_ROLES_UPDATED` → updates `roles` array.
  - All list and detail queries can join `workflow_instances` to `we_user_shadows` for display-friendly fields like `full_name`.

---

### 2.5 `rule-engine` Module

The `rule-engine` module is a stateless wrapper around `json-rules-engine` and custom strategies.

- It exposes `IRuleEngineContract` via `RULE_ENGINE_CONTRACT` and is imported by `WorkflowExecutionModule`.
- Key components:
  - `RuleContextBuilder` builds the `facts` object from `RuleContext`.
  - `ConditionEvaluator` wraps `json-rules-engine` for expression-based rules.
  - `CustomRuleEvaluator` handles custom strategies where rules are not purely AST-based.
  - `RuleMetadataService` and `RuleMetadataController` expose rule-building metadata to the frontend for dynamic rule authoring UI.

---

### 2.6 `audit` Module

The `audit` module is a pure append-only log reader/writer:

- `AuditLog` entity maps to `audit_logs`.
- `audit.subscriber.ts` listens to NATS events from execution and identity domains.
- `AuditService` supports filtered and paginated reads over `audit_logs`.
- `AuditController` exposes `GET /instances/:id/audit-logs`.

It never exposes mutable operations, and DB triggers (see database design) block `UPDATE`/`DELETE` on `audit_logs`.

---

### 2.7 `notification` Module

The `notification` module handles:

- email templates (`notification_templates`),
- email/webhook delivery (`notification_logs`, `webhook_configs`, `webhook_delivery_logs`),
- NATS subscribers for workflow events.

Design notes:

- Webhooks use an `X-Workflow-Signature: sha256=<hmac>` header, with secrets stored in `webhook_configs.secret`.
- Notification sending is decoupled from transition execution; failures do not roll back core transitions.

---

### 2.8 `database` Module

The `database` module configures:

- TypeORM connection (`createDataSource`, `PostgreSQLDatabaseModule`),
- RLS context via `RlsContextService`,
- request → DB context wiring via `DatabaseContextInterceptor`,
- migrations including table creation and RLS policies.

RLS ensures:

- queries without `tenant_id` filters are still tenant-isolated,
- even if SQL injection occurs, tenant boundaries cannot be crossed.

---

### 2.9 `health` Module

Provides:

- `GET /health` for liveness,
- `GET /health/ready` for readiness.

Uses Nest Terminus and/or custom logic to check:

- DB connectivity,
- Redis connectivity,
- NATS connectivity.

---

### 2.10 `dashboard` Module

The `dashboard` module composes cross-cutting stats:

- counts of tenants, users, definitions, instances, notifications, etc.
- shapes are defined in `dashboard-stats-response.dto.ts`.

It uses query contracts rather than direct repositories where possible, ensuring low coupling.

---

## 3. Design Patterns Catalogue

| Pattern              | Where Used                                       | File Path (Representative)                                            | Why                                                                                            |
| -------------------- | ------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Repository           | All persistence-bound modules                    | `src/modules/**/repositories/*.repository.ts`                         | Encapsulates queries, enforces tenant scoping, and centralizes DB access logic.                |
| Aggregate Root       | Workflow definition aggregate                    | `workflow-definition.service.ts` and related repositories             | Enforces invariants like single initial state and snapshot immutability at aggregate boundary. |
| Factory              | Entity creation with defaults                    | `tenant.repository.ts`, `workflow-definition.repository.ts`           | Centralizes initialization details and makes domain operations more declarative.               |
| Strategy             | Rule evaluation strategies                       | `rule-engine/evaluators/*.ts`                                         | Allows multiple rule backends (expression vs custom) behind a common interface.                |
| CQRS                 | Workflow execution (commands/queries separation) | `workflow-execution/commands/*`, `workflow-execution/queries/*`       | Separates reads and writes, easing scaling and reasoning about side effects.                   |
| Observer / Pub-Sub   | NATS events across modules                       | `*/*.publisher.ts`, `*/subscribers/*.ts`                              | Decouples producers and consumers and supports microservice extraction.                        |
| Decorator            | Metadata-based access control and context        | `libs/shared/decorators/*.ts`                                         | Adds cross-cutting concerns declaratively at controller boundaries.                            |
| Guard                | JWT auth / tenant isolation / RBAC               | `libs/shared/guards/*.ts`                                             | Enforces security requirements on incoming requests before domain logic runs.                  |
| Interceptor          | Logging, tenant & DB context                     | `libs/shared/interceptors/*.ts`, `database-context.interceptor.ts`    | Instruments and manipulates execution around handlers for observability and RLS.               |
| Shadow Read Model    | User shadows for execution module                | `we-user-shadow.entity.ts`, `auth-events.subscriber.ts`               | Provides local denormalized mirrors of cross-module data for performant joins.                 |
| Cache-aside          | Redis-backed query optimizations                 | `RedisService` usages throughout query services                       | Avoids DB overload, improves latency while keeping DB as source of truth.                      |
| Idempotent Consumer  | Event subscribers like audit and notification    | `audit.subscriber.ts` (`findByEventId`), `notification.subscriber.ts` | Handles at-least-once delivery semantics safely.                                               |
| Rate Limiter (Leaky) | Enhanced per-tenant request limiting             | `src/infra/middlewares/enhanced-rate-limit.middleware.ts`             | Implements leaky-bucket for fair multi-tenant rate limiting.                                   |

---

## 4. Common / Shared Layer

The `libs/shared` library provides cross-cutting types and infrastructure that must not depend on application modules.

### 4.1 Decorators

Key decorators are in `libs/shared/src/decorators`:

- `current-user.decorator.ts` → `@CurrentUser() user: IJwtPayload`:
  - Extracts the authenticated user payload from `req.user`.
- `tenant-id.decorator.ts` → `@TenantId() tenantId: string`:
  - Extracts `req.user.tenantId`, enforcing that tenant comes from JWT.
- `roles.decorator.ts` → `@Roles(...roles: string[])`:
  - Uses `SetMetadata('roles', roles)` for RBAC metadata.
- `public.decorator.ts`:
  - Marks endpoints to bypass global JWT guard (e.g. login, refresh, health).

### 4.2 Guards

In `libs/shared/src/guards`:

- `JwtAuthGuard`:
  - Extends `AuthGuard('jwt')`.
  - Validates JWT and populates `req.user` as `IJwtPayload`.
- `TenantIsolationGuard`:
  - Ensures `req.user.tenantId` exists and is consistent across the request pipeline.
- `RolesGuard`:
  - Reads `@Roles()` metadata and ensures current user has at least one required role.

These are registered globally in `AppModule` in a specific order: `ThrottlerGuard` → `JwtAuthGuard` → `TenantIsolationGuard` → `RolesGuard`.

### 4.3 Pipes / Interceptors

- Global `ValidationPipe`:
  - Configured in `main.ts` with `transform: true`, `stopAtFirstError: true`, `whitelist: true`.
  - Enforces DTO shapes and strips unknown properties.

- Interceptors:
  - `TenantContextInterceptor`:
    - Copies `req.user.tenantId` into `req.tenantId` for convenience.
  - `LoggingInterceptor`:
    - Uses Winston to log structured request/response data.
  - `DatabaseContextInterceptor`:
    - Calls `RlsContextService.setTenantContext(tenantId)` to set PostgreSQL `app.tenant_id` session setting prior to DB calls.

### 4.4 Contracts / Interfaces

Located under `libs/shared/src/interfaces`:

- Contract interfaces:

  | Contract                          | File Path                                                   | Purpose                                               |
  | --------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
  | `IUserQueryContract`              | `interfaces/contracts/user-query.contract.ts`               | Cross-module user summary/read operations.            |
  | `ITenantQueryContract`            | `interfaces/contracts/tenant-query.contract.ts`             | Cross-module tenant lookup and feature flags.         |
  | `IWorkflowQueryContract`          | `interfaces/contracts/workflow-query.contract.ts`           | Cross-module workflow definition and snapshot access. |
  | `IWorkflowExecutionQueryContract` | `interfaces/contracts/workflow-execution-query.contract.ts` | Instance-centric query-side interface.                |
  | `IRuleEngineContract`             | `interfaces/contracts/rule-engine.contract.ts`              | Rule evaluation abstraction.                          |

- Event payload interfaces (e.g. `IUserCreatedEvent`, `IWorkflowTransitionCompletedEvent`) are defined under `interfaces/events`.
- `IJwtPayload` is the canonical JWT shape used by both backend and frontend (`types/api.ts` mirrors the structure).

---

## 5. Workflow Execution Engine — Deep Dive

### 5.1 State Machine Design

At runtime, each workflow instance:

- is created from a specific `WorkflowDefinitionVersion.snapshot`,
- has a `currentStateId` / `currentStateName`,
- may transition to one of several allowed next states based on:
  - user roles (RBAC),
  - rule evaluation,
  - instance status (must be active and non-terminal).

The state machine is fully defined in the snapshot:

- `states`: define nodes, with `isInitial` and `isTerminal` flags.
- `transitions`: define directed edges between states and RBAC restrictions.
- `rules`: define conditions (`ruleDefinition` as JSON AST) attached to transitions.

The engine is deterministic per snapshot version: once a definition version is published, all instances based on it will see the same topology and rules.

### 5.2 Rule Evaluation (`json-rules-engine` Integration)

**Why `json-rules-engine` over Drools, JBoss Rules, or a custom AST-based engine?**

- **Choices considered:**
  - `json-rules-engine`:
    - Node-friendly, JSON-native, expressive enough for most business conditions.
    - Integrates cleanly with JSONB storage in PostgreSQL.
  - Drools / JBoss Rules:
    - Very powerful, but Java-based; would require an external service and network RPC from Node.
    - Higher operational and cognitive overhead for a TypeScript-first stack.
  - Custom AST-based engine:
    - Fully flexible, but costly to implement, test, secure, and maintain.
    - High risk of subtle correctness and security issues.

- **Decision:** use `json-rules-engine` as the primary rule evaluator.
  - It aligns naturally with:
    - JSON-based APIs for rule definition,
    - JSONB storage in `transition_rules.rule_definition`,
    - TypeScript type-safety around rule payloads and evaluation results.

  - It avoids:
    - executing arbitrary user code (no `eval`),
    - tying the stack to a separate Java-based rule service.

- **Trade-offs:**
  - CPU-bound evaluation in the main process must be controlled under load (e.g. via rate limiting and bulkheads).
  - Complex domain-specific DSL features might require custom strategies, but these can be added incrementally via `CustomRuleEvaluator`.

**Evaluation Flow**

1. Command handler builds `RuleContext` with:
   - `payload`: instance payload,
   - `user`: `id`, current roles,
   - `instance`: current state, created date.
2. `RuleContextBuilder` builds facts object from context.
3. `RuleEngineService.evaluateRules`:
   - sorts rules by `evaluationOrder`,
   - for each rule:
     - uses `CustomRuleEvaluator` if flagged as custom,
     - otherwise sends rule to `ConditionEvaluator` (which wraps `json-rules-engine`).
   - aggregates and returns failed rule list and overall `passed` boolean.

### 5.3 Immutable Snapshot Strategy

Publishing a workflow definition:

- Assembles all related entities:
  - definition,
  - states,
  - transitions,
  - rules.
- Builds a single snapshot object stored in `workflow_definition_versions.snapshot`.
- Sets `is_active` on the new version and `status = 'published'` on the definition.

Runtime invariants:

- `WorkflowInstance` persists `definitionVersion`, ensuring it always uses the exact snapshot for evaluation.
- Changes to the definition post-publish do not affect existing instances; they can only target new instances (via new versions).

This is critical for auditability and for deterministic execution in long-running workflows.

### 5.4 Execution Context Design

The execution context for rule evaluation and transitions is:

```ts
interface RuleContext {
  payload: Record<string, unknown>;
  user: { id: string; role: string; roles: string[] };
  instance: { currentState: string; createdAt: string };
}
```

Command handlers and `TransitionExecutorService` are responsible for:

- populating this context from:
  - `WorkflowInstance` row,
  - JWT payload,
  - definition snapshot.

This provides a clear separation between:

- _engine invariants_ (state machine correctness, idempotency, optimistic locking),
- _tenant configuration_ (definition, rules),
- _tenant domain logic_ (outside the engine, in connectors and external systems).

---

## 6. Database Schema (detailed)

This section focuses on how entities map to tables and how the low-level design supports multi-tenancy and module boundaries.

### 6.1 TypeORM Entity Class Catalogue (table: entity, file path, table name)

| Entity Class                | File Path                                                                        | Table Name                     |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| `User`                      | `src/modules/auth/entities/user.entity.ts`                                       | `users`                        |
| `Role`                      | `src/modules/auth/entities/role.entity.ts`                                       | `roles`                        |
| `Permission`                | `src/modules/auth/entities/permission.entity.ts`                                 | `permissions`                  |
| `UserRole`                  | `src/modules/auth/entities/user-role.entity.ts`                                  | `user_roles`                   |
| `RefreshToken`              | `src/modules/auth/entities/refresh-token.entity.ts`                              | `refresh_tokens`               |
| `Tenant`                    | `src/modules/tenant/entities/tenant.entity.ts`                                   | `tenants`                      |
| `TenantSettings`            | `src/modules/tenant/entities/tenant-settings.entity.ts`                          | `tenant_settings`              |
| `TenantFeatureFlag`         | `src/modules/tenant/entities/tenant-feature-flag.entity.ts`                      | `tenant_feature_flags`         |
| `WorkflowDefinition`        | `src/modules/workflow-definition/entities/workflow-definition.entity.ts`         | `workflow_definitions`         |
| `WorkflowDefinitionVersion` | `src/modules/workflow-definition/entities/workflow-definition-version.entity.ts` | `workflow_definition_versions` |
| `WorkflowState`             | `src/modules/workflow-definition/entities/workflow-state.entity.ts`              | `workflow_states`              |
| `WorkflowTransition`        | `src/modules/workflow-definition/entities/workflow-transition.entity.ts`         | `workflow_transitions`         |
| `TransitionRule`            | `src/modules/workflow-definition/entities/transition-rule.entity.ts`             | `transition_rules`             |
| `InstanceFormSchema`        | `src/modules/workflow-definition/entities/instance-form-schema.entity.ts`        | `instance_form_schemas`        |
| `WorkflowInstance`          | `src/modules/workflow-execution/entities/workflow-instance.entity.ts`            | `workflow_instances`           |
| `WeUserShadow`              | `src/modules/workflow-execution/entities/we-user-shadow.entity.ts`               | `we_user_shadows`              |
| `AuditLog`                  | `src/modules/audit/entities/audit-log.entity.ts`                                 | `audit_logs`                   |
| `NotificationTemplate`      | `src/modules/notification/entities/notification-template.entity.ts`              | `notification_templates`       |
| `NotificationLog`           | `src/modules/notification/entities/notification-log.entity.ts`                   | `notification_logs`            |
| `WebhookConfig`             | `src/modules/notification/entities/webhook-config.entity.ts`                     | `webhook_configs`              |
| `WebhookDeliveryLog`        | `src/modules/notification/entities/webhook-delivery-log.entity.ts`               | `webhook_delivery_logs`        |

### 6.2 Key Entity Relationships

#### Same-module relations

Within a module, relations are defined where they do not compromise extractability:

- In `auth`:
  - `UserRole.user` and `UserRole.role` have `@ManyToOne` relations with cascade deletes.
  - `User` has `@OneToMany` to `UserRole`.

  These are safe because they remain inside the `auth` bounded context.

#### Cross-module references (no ORM relations)

Cross-module references are always:

- simple UUID columns,
- resolved via contracts or event-driven denormalization.

Examples:

- `workflow_instances.workflow_definition_id` references `workflow_definitions.id` by ID only.
- `audit_logs.instance_id` references `workflow_instances.id`, but the entity does not define a `@ManyToOne` relation.
- `notification_logs.template_id` references `notification_templates.id`.

This aligns with the schema design philosophy:

- it avoids hidden joins and N+1 problems,
- prevents breaking module boundaries if modules are extracted to microservices,
- keeps RLS consistent and explicit at the repository level.

---

## 7. Error Handling Strategy

### 7.1 Exception Hierarchy

- Domain/business error codes are defined in `AppErrors` enum (`libs/shared/src/constants/app-errors.enum.ts`).
- Services throw Nest HTTP exceptions with these codes:
  - `NotFoundException(AppErrors.USER_NOT_FOUND)`
  - `ConflictException(AppErrors.EMAIL_ALREADY_EXISTS)`
  - `BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_DRAFT)`
  - etc.

### 7.2 Global Exception Filter

The global exception filter (`GlobalExceptionFilter`) in `libs/shared/src/filters/global-exception.filter.ts`:

- catches all unhandled errors,
- maps them to a uniform error response:

```json
{
  "statusCode": 400,
  "errorCode": "WORKFLOW_DEFINITION_NOT_DRAFT",
  "message": "Workflow definition must be in draft state",
  "timestamp": "2026-03-10T10:00:00.000Z",
  "path": "/api/v1/workflow-definitions/..."
}
```

### 7.3 Domain Error vs HTTP Error Mapping

- Domain invariants are enforced in services and repositories, not in controllers.
- Controllers simply forward DTOs to services and return normalized responses.
- This separation:
  - keeps controllers thin,
  - enables reuse of service logic across HTTP and potential future transports (e.g. gRPC),
  - centralizes mapping between domain errors and HTTP concerns.

---

## 8. Frontend Low Level Design

### 8.1 Component Architecture

- Entry point:
  - `src/main.tsx` renders `<App />` into `#root`.
- Root:
  - `src/App.tsx` composes:
    - `QueryClientProvider`,
    - `ThemeProvider`,
    - `TooltipProvider`,
    - toast components (`Toaster`, `Sonner`),
    - `BrowserRouter` with nested routes.
- Layout:
  - `components/layout/AppShell.tsx` provides shared sidebar/topbar layout for protected routes.
  - `components/layout/Sidebar.tsx`, `components/layout/Topbar.tsx` display navigation and user info.

Page-level components:

| Page                   | File Path                               | Backend Area                  |
| ---------------------- | --------------------------------------- | ----------------------------- |
| `LoginPage`            | `src/pages/auth/LoginPage.tsx`          | `/auth/login`                 |
| `RegisterTenantPage`   | `src/pages/auth/RegisterTenantPage.tsx` | `/auth/register/tenant`       |
| `SelfRegisterPage`     | `src/pages/auth/SelfRegisterPage.tsx`   | `/auth/register`              |
| `DashboardPage`        | `src/pages/DashboardPage.tsx`           | `dashboard` module            |
| `WorkflowsPage`        | `src/pages/WorkflowsPage.tsx`           | workflow-definition list      |
| `WorkflowDesignerPage` | `src/pages/WorkflowDesignerPage.tsx`    | workflow-definition detail UI |
| `InstancesPage`        | `src/pages/InstancesPage.tsx`           | `/workflow-instances` list    |
| `CreateInstancePage`   | `src/pages/CreateInstancePage.tsx`      | `/workflow-instances` create  |
| `InstanceDetailPage`   | `src/pages/InstanceDetailPage.tsx`      | `/workflow-instances/:id`     |
| `UsersPage`            | `src/pages/UsersPage.tsx`               | `/users`                      |
| `RolesPage`            | `src/pages/RolesPage.tsx`               | `/roles`                      |
| `SettingsPage`         | `src/pages/SettingsPage.tsx`            | tenant settings               |
| `PricingPage`          | `src/pages/PricingPage.tsx`             | plan information              |
| `NotificationsPage`    | `src/pages/NotificationsPage.tsx`       | notification templates        |
| `WebhooksPage`         | `src/pages/WebhooksPage.tsx`            | webhook configs               |
| `NotFound`             | `src/pages/NotFound.tsx`                | 404 route                     |

### 8.2 Hook Patterns

- Protected routing:
  - `components/auth/ProtectedRoute.tsx`:
    - checks `useAuthStore((s) => s.isAuthenticated)`,
    - redirects to `/login` if not authenticated.
  - `components/auth/AdminRoute.tsx`:
    - ensures `user.roles` includes admin role.

- UI utilities:
  - `hooks/use-toast.ts` and `components/ui/use-toast.ts` provide consistent toast APIs.
  - `hooks/use-mobile.tsx` provides responsive behavior (e.g. layout switches).

### 8.3 API Client Design (TanStack Query setup)

- `src/lib/api-client.ts` defines:
  - `apiClient` (Axios) with:
    - `baseURL` from `VITE_API_BASE_URL`,
    - `withCredentials = true`,
    - default headers (`Content-Type: application/json`).

  - CSRF handling:
    - `getCsrfHeaders` fetches `/api/v1/csrf-token` and returns `X-CSRF-Token`.
    - A request interceptor attaches CSRF token automatically for mutating methods.

  - JWT propagation:
    - Interceptor reads `accessToken` from `useAuthStore`.
    - Sets `Authorization: Bearer <token>` header if present.

  - Auto-refresh on 401:
    - On first 401 response, triggers `/api/v1/auth/refresh` with current `refreshToken`.
    - Updates tokens in `useAuthStore`.
    - Retries original request with new access token.
    - On second failure, logs out and redirects to `/login`.

- `src/lib/query-client.ts`:
  - Configures `QueryClient` with:
    - `staleTime = 2 minutes`,
    - custom retry function that:
      - disables retries for 401/403/404,
      - allows 2 retries for other statuses.

### 8.4 Zustand Store Design

Auth store in `src/stores/auth-store.ts`:

```ts
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  tenantId: string;
  tenantSlug: string;
  roles: string[];
  roleIds: string[];
  plan: string;
}
```

```ts
interface AuthStore {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setSession(accessToken: string, refreshToken: string, user: AuthUser): void;
  setTokens(accessToken: string, refreshToken: string): void;
  logout(): void;
}
```

The store:

- persists to `localStorage` under key `flowforge-auth`,
- partializes to persist only tokens and `user` data,
- powers route guards and header/UI state via `useAuthStore` selectors.

---

## 9. Dependencies & Versions

### 9.1 Backend Dependencies

From `backend/package.json`, key runtime dependencies and their roles:

| Package                    | Version  | Role                                             |
| -------------------------- | -------- | ------------------------------------------------ |
| `@nestjs/common`           | ^10.0.0  | Core Nest primitives                             |
| `@nestjs/config`           | ^4.0.3   | Typed configuration management                   |
| `@nestjs/core`             | ^10.0.0  | Nest application core                            |
| `@nestjs/cqrs`             | ^10.0.3  | CQRS infrastructure (commands, queries, buses)   |
| `@nestjs/jwt`              | ^11.0.2  | JWT issuance/verification                        |
| `@nestjs/microservices`    | ^10.1.15 | NATS microservice integration                    |
| `@nestjs/passport`         | ^11.0.5  | Passport integration                             |
| `@nestjs/platform-express` | ^10.0.0  | Express-based HTTP adapter                       |
| `@nestjs/schedule`         | ^6.1.1   | Cron/interval job scheduling                     |
| `@nestjs/swagger`          | ^11.2.6  | Swagger/OpenAPI generation                       |
| `@nestjs/terminus`         | ^11.1.1  | Health checks                                    |
| `@nestjs/throttler`        | ^6.5.0   | Global request rate limiting                     |
| `@nestjs/typeorm`          | ^11.0.0  | TypeORM integration                              |
| `argon2`                   | ^0.44.0  | Password hashing                                 |
| `axios`                    | ^1.13.6  | HTTP client for webhooks/external APIs           |
| `class-transformer`        | ^0.5.1   | DTO serialization                                |
| `class-validator`          | ^0.15.1  | DTO validation                                   |
| `compression`              | ^1.8.1   | HTTP compression                                 |
| `cookie-parser`            | ^1.4.7   | Cookie parsing                                   |
| `csurf`                    | ^1.11.0  | CSRF protection                                  |
| `helmet`                   | ^8.1.0   | HTTP header security                             |
| `hpp`                      | ^0.2.3   | HTTP parameter pollution protection              |
| `ioredis`                  | ^5.10.0  | Redis client (cache, rate limiting, idempotency) |
| `joi`                      | ^18.0.2  | Environment configuration schema validation      |
| `json-rules-engine`        | ^7.3.1   | Business rule evaluation                         |
| `nats`                     | ^2.29.3  | NATS client for events                           |
| `nest-winston`             | ^1.10.2  | Logging integration                              |
| `nodemailer`               | ^8.0.1   | Email transport                                  |
| `passport` and strategies  | various  | Authentication strategies                        |
| `pg`                       | ^8.19.0  | PostgreSQL driver                                |
| `typeorm`                  | ^0.3.28  | ORM                                              |
| `uuid`                     | ^13.0.0  | UUID generation                                  |
| `winston`                  | ^3.19.0  | Logging                                          |
| `xss-clean`                | ^0.1.4   | XSS protection                                   |

Dev dependencies include Nest CLI, TypeScript, ESLint, Jest, and supporting toolchain.

### 9.2 Frontend Dependencies

From `frontend/package.json`:

| Package                 | Version  | Role                            |
| ----------------------- | -------- | ------------------------------- |
| `react`, `react-dom`    | ^18.3.1  | View library                    |
| `react-router-dom`      | ^6.30.1  | Client-side routing             |
| `@tanstack/react-query` | ^5.83.0  | Server state management         |
| `zustand`               | ^5.0.11  | Client-side auth/session store  |
| `axios`                 | ^1.13.6  | HTTP client                     |
| `@xyflow/react`         | ^12.10.1 | Visual workflow designer        |
| `zod`                   | ^3.25.76 | Validation for forms and params |
| `@radix-ui/*`           | ^1.x     | Headless UI primitives          |
| `tailwindcss`, `clsx`   | ^3.4.17  | Styling and class composition   |
| `lucide-react`          | ^0.462.0 | Icon set                        |
| `@tanstack/react-table` | ^8.21.3  | Table abstraction               |
| `sonner`                | ^1.7.4   | Toast notifications             |
| `vite`                  | ^5.4.19  | Bundler                         |
| `vitest`                | ^3.2.4   | Test runner                     |

---

## 10. Embedded Reference Sections

They are part of the low level design documentation because they define foundational architectural and behavioral constraints.

### 10.1 Section 1: Microservice-Extractable Contract-First Modular Monolith

#### First, Define the Problem Precisely

You have three distinct scenarios disguised as one question. Each needs a different solution.

| Scenario                                               | Example                                                                        | Wrong Solution                 | Right Solution                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------- |
| Current request user context                           | TenantService needs to know WHO is making this API call                        | Query users table              | Read from JWT claims                        |
| Synchronous lookup of another entity                   | TenantService needs details of a specific user by ID to process business logic | Import UserRepository directly | Export a contract interface from AuthModule |
| Data needed for complex queries / joins across modules | WorkflowExecution needs tenant plan limits + user roles together               | Cross-module SQL join          | Event-driven shadow/read mode               |

#### Cross-Module Data Access — The Right Patterns

##### Pattern 1 — JWT Claims (Zero DB Calls)

###### When to use it

When the data you need is about the currently authenticated user making the request. This covers 80% of apparent cross-module data needs.

###### How it works

The JWT token is issued by AuthModule at login time. It contains a payload. That payload travels with every request. Every module can read it without touching the database.

###### JWT Payload (set at login, read everywhere):

```typescript
{
sub: "user-uuid",
email: "john@acme.com",
tenantId: "tenant-uuid",
roles: ["Admin"],
firstName: "John",
plan: "pro" ← tenant plan embedded too
}
```

The @CurrentUser() decorator in libs/shared extracts this from request.user (populated by the JWT strategy). No DB call. No module import. No coupling.

TenantController:

```typescript
createSomething(@CurrentUser() user: JwtPayload) {
// user.tenantId, user.roles, user.email — all available
// No AuthModule import needed
}
```

###### What lives in the JWT

Populate the JWT intelligently at login time. Include fields that are frequently needed across modules.

`libs/shared/src/interfaces/jwt-payload.interface.ts`

```typescript
IJwtPayload {
sub: string // userId
email: string
tenantId: string
tenantSlug: string
roles: string[] // ['Admin', 'Approver']
plan: string // 'free' | 'pro' | 'enterprise'
firstName: string
iat: number
exp: number
}
```

Rule of thumb: If it's about who is asking, use JWT. If it's about someone or something else, read on.

##### Pattern 2 — Exported Contract Interface (Synchronous Cross-Module Query)

###### When to use it

When Module B needs to look up a specific entity owned by Module A by ID, and it needs the result before it can continue processing. This is a true synchronous dependency.

###### The Wrong Way (that breaks microservice extraction)

```typescript
// ❌ WRONG — TenantService directly importing AuthModule's repository
import { UserRepository } from "../auth/repositories/user.repository";

@Injectable()
export class TenantService {
  constructor(private userRepo: UserRepository) {} // ← breaks everything on extraction
}
```

This creates a hard coupling at the repository layer. When you extract AuthModule to its own service, `UserRepository` no longer exists in the same process. Your code breaks.

##### The Right Way — Export a Purpose-Built Query Service

AuthModule exposes a **deliberately limited interface** — only the methods other modules are allowed to call. Not the full repository. Not the full UserService. A contract surface.

**Step 1: Create the contract interface in `libs/shared`**

```text
libs/shared/src/interfaces/
├── contracts/ ← NEW folder
│ ├── user-query.contract.ts ← what AuthModule promises to expose
│ ├── tenant-query.contract.ts ← what TenantModule promises to expose
│ └── workflow-query.contract.ts ← what WorkflowDefinitionModule promises to expose
```

```typescript
// libs/shared/src/interfaces/contracts/user-query.contract.ts

export const USER_QUERY_CONTRACT = Symbol("USER_QUERY_CONTRACT");

export interface IUserQueryContract {
  findById(userId: string, tenantId: string): Promise<UserSummary | null>;
  findManyByIds(userIds: string[], tenantId: string): Promise<UserSummary[]>;
  existsWithRole(userId: string, tenantId: string, role: string): Promise<boolean>;
}

// The shape returned — NOT the full entity, only what consumers need
export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  isActive: boolean;
}
```

**Step 2: Implement it inside AuthModule**

```text
apps/api/src/modules/auth/
├── services/
│ ├── auth.service.ts
│ ├── user.service.ts ← internal full service
│ └── user-query.service.ts ← implements the contract, thin facade
```

```typescript
// apps/api/src/modules/auth/services/user-query.service.ts

@Injectable()
export class UserQueryService implements IUserQueryContract {
  constructor(private readonly userRepository: UserRepository) {}

  async findById(userId: string, tenantId: string): Promise<UserSummary | null> {
    // Only queries what the contract shape needs, nothing more
    return this.userRepository.findSummaryById(userId, tenantId);
  }

  async findManyByIds(userIds: string[], tenantId: string): Promise<UserSummary[]> {
    return this.userRepository.findSummariesByIds(userIds, tenantId);
  }

  async existsWithRole(userId: string, tenantId: string, role: string): Promise<boolean> {
    return this.userRepository.existsWithRole(userId, tenantId, role);
  }
}
```

**Step 3: AuthModule exports ONLY this contract service**

```typescript
// apps/api/src/modules/auth/auth.module.ts

@Module({
  providers: [
    AuthService,
    UserService,
    UserQueryService,
    UserRepository,
    {
      provide: USER_QUERY_CONTRACT, // ← register against the symbol token
      useClass: UserQueryService,
    },
  ],
  exports: [
    USER_QUERY_CONTRACT, // ← ONLY this is exported, nothing else
  ],
})
export class AuthModule {}
```

**Step 4: TenantModule consumes it via the contract token**

```typescript
// apps/api/src/modules/tenant/tenant.module.ts

@Module({
  imports: [AuthModule], // ← imports the whole module
  providers: [TenantService],
})
export class TenantModule {}
```

```text
typescript// apps/api/src/modules/tenant/services/tenant.service.ts

@Injectable()
export class TenantService {
constructor(
@Inject(USER_QUERY_CONTRACT)
private readonly userQuery: IUserQueryContract, // ← depends on interface, not class
) {}

async assignAdminToTenant(tenantId: string, userId: string): Promise<void> {
const user = await this.userQuery.findById(userId, tenantId);
if (!user || !user.isActive) {
throw new BusinessException(AppErrors.USER_NOT_FOUND);
}
// continue with tenant logic
}
}
```

##### Why This Is Microservice-Ready

When you extract AuthModule to its own service:

1. Create `AuthGrpcQueryService` that implements the **same `IUserQueryContract` interface**
2. It makes a gRPC call instead of a DB call internally
3. Register it against `USER_QUERY_CONTRACT` token
4. **`TenantService` code does not change at all.** It still calls `this.userQuery.findById()`. It doesn't know or care that it's now a network call.

```text
BEFORE EXTRACTION:
TenantService → USER_QUERY_CONTRACT → UserQueryService → UserRepository → DB
(in-process call)

AFTER EXTRACTION:
TenantService → USER_QUERY_CONTRACT → AuthGrpcQueryService → [network] → Auth Microservice → DB
(same interface, different implementation)
```

This is the **Dependency Inversion Principle** applied at module boundaries — depend on abstractions, not concretions.

---

#### Pattern 3 — Event-Driven Shadow Read Models (Local Denormalization)

##### When to use it

When:

- You need data from another module **frequently** (many queries per second)
- You need to **join or filter** across module-owned data for reporting or list views
- The source data **changes infrequently** (users, tenant settings)
- Latency of a synchronous cross-module call would be unacceptable at scale
- You are truly planning to extract to separate microservices (separate DBs, no shared schema)

##### The Problem This Solves

Imagine `WorkflowExecution` module needs to show a list of instances with:

- Instance status (owned by WorkflowExecution)
- Creator's full name (owned by Auth)
- Tenant plan (owned by Tenant)

You have two bad options without this pattern:

- Option A: 3 service calls per list item → N+1 query problem → terrible latency
- Option B: Import 2 module services → tight coupling, breaks on extraction

##### The Solution — Shadow Table + Event Subscription

Each module maintains a **local denormalized copy** of the foreign data it needs frequently. It keeps this copy fresh by listening to NATS events from the owning module.

**Step 1: WorkflowExecution creates its own shadow table for user data**

```text
apps/api/src/modules/workflow-execution/
├── entities/
│ ├── workflow-instance.entity.ts
│ └── user-shadow.entity.ts ← local read model, NOT the source of truth
├── repositories/
│ └── user-shadow.repository.ts
├── subscribers/
│ └── auth-events.subscriber.ts ← keeps shadow table in sync
```

```typescript
// apps/api/src/modules/workflow-execution/entities/user-shadow.entity.ts

@Entity("we*user_shadows") // ← prefixed 'we*' = workflow-execution module
export class UserShadow {
  @PrimaryColumn("uuid")
  id: string; // same as users.id in AuthModule

  @Column()
  tenantId: string;

  @Column()
  email: string;

  @Column()
  fullName: string; // pre-concatenated for fast display

  @Column("simple-array")
  roles: string[];

  @Column()
  isActive: boolean;

  @Column({ type: "timestamptz" })
  syncedAt: Date; // when was this shadow last updated
}
```

**Step 2: The subscriber keeps it in sync**

```ts
// apps/api/src/modules/workflow-execution/subscribers/auth-events.subscriber.ts

@Controller()
export class AuthEventsSubscriber {
  constructor(private readonly userShadowRepository: UserShadowRepository) {}

  @EventPattern(NatsEvents.USER_CREATED)
  async onUserCreated(data: IUserCreatedEvent): Promise<void> {
    await this.userShadowRepository.upsert({
      id: data.userId,
      tenantId: data.tenantId,
      email: data.email,
      fullName: `${data.firstName} ${data.lastName}`,
      roles: data.roles,
      isActive: true,
      syncedAt: new Date(),
    });
  }

  @EventPattern(NatsEvents.USER_DEACTIVATED)
  async onUserDeactivated(data: IUserDeactivatedEvent): Promise<void> {
    await this.userShadowRepository.update(data.userId, {
      isActive: false,
      syncedAt: new Date(),
    });
  }

  @EventPattern(NatsEvents.USER_ROLES_UPDATED)
  async onUserRolesUpdated(data: IUserRolesUpdatedEvent): Promise<void> {
    await this.userShadowRepository.update(data.userId, {
      roles: data.roles,
      syncedAt: new Date(),
    });
  }
}
```

**Step 3: WorkflowExecution queries its own data only**

```ts
// apps/api/src/modules/workflow-execution/services/workflow-execution.service.ts

async getInstancesForDashboard(tenantId: string): Promise<InstanceDashboardItem[]> {
// Single SQL query, all within WorkflowExecution module's tables
return this.instanceRepository.findWithCreatorNames(tenantId);
// JOIN workflow_instances wi ON we_user_shadows us WHERE us.id = wi.created_by
// No cross-module call. No N+1. Pure SQL join within this module's data.
}
```

##### Why This Is Truly Microservice-Ready

When extracted to separate services with separate databases:

- The shadow table becomes a real standalone table in the WorkflowExecution service's own DB
- The NATS subscription already works across process boundaries — it doesn't care if publisher is in the same process or a different server
- **Zero code changes to the subscriber or the service logic**

---

#### Full Decision Tree — Which Pattern When

```text
You need data from Module A while you're in Module B
                    │
                    ▼
       Is this data about the CURRENT
       authenticated user making the request?
                    │
         YES ───────┴──────── NO
          │                    │
          ▼                    ▼
    Use JWT Claims      Do you need the result
    @CurrentUser()      SYNCHRONOUSLY to continue
    Zero DB call        this exact operation?
                                │
                    YES ────────┴──────── NO
                     │                    │
                     ▼                    ▼
             Will you call this     Use Event-Driven
             infrequently (admin    Shadow Read Model
             ops, rare lookups)?   (high frequency,
                     │              complex queries,
                     ▼              true MS ready)
             Export Contract
             Interface from
             owning module
             (Pattern 2)
```

#### Summary Table — All Three Patterns Side by Side

|                           | Pattern 1: JWT Claims                | Pattern 2: Contract Interface               | Pattern 3: Shadow Read Model              |
| ------------------------- | ------------------------------------ | ------------------------------------------- | ----------------------------------------- |
| Use when                  | Data about current request user      | Synchronous lookup of specific entity by ID | High-frequency queries, list views, joins |
| Coupling                  | Zero — no module import              | Loose — depends on interface not class      | Zero — event-driven                       |
| Latency                   | Zero — in-memory                     | Low — in-process service call               | Zero — local DB query                     |
| Consistency               | Strong (from login)                  | Strong (live query)                         | Eventually consistent                     |
| MS extraction cost        | Zero — already works                 | Swap impl to gRPC client                    | Zero — NATS already crosses processes     |
| Code change on extraction | None                                 | One line: swap provider impl                | None                                      |
| Where data lives          | JWT token                            | Owning module's DB                          | Consumer module's own shadow table        |
| Good for                  | userId, tenantId, roles, email, plan | Rare admin lookups, validation              | Dashboards, lists, audit views            |

### 10.2 Section 2: API Architecture Pattern

#### API Architecture Pattern

Recommendation: REST for external APIs, Internal Events via NATS

| Pattern                  | Verdict for This System             | Reason                                                                                                                                                              |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REST                     | ✅ Primary API                      | Standard, well-understood, works perfectly for CRUD + resource operations, great tooling (Swagger/OpenAPI), stateless                                               |
| GraphQL                  | ❌ Not recommended as primary       | Overkill for this use case — transitions and workflow execution are action-based, not graph-query-based. Also harder to implement auth middleware cleanly per field |
| gRPC                     | ✅ Internal service-to-service only | If you split into microservices — gRPC for sync calls between services (faster than REST, schema-enforced via Protobuf)                                             |
| SSE (Server-Sent Events) | ✅ For real-time updates            | When an approver is viewing an instance and another user transitions it, SSE pushes the update without polling                                                      |
| WebSockets               | ⚠️ Only if bidirectional needed     | SSE is sufficient for this use case (server pushes to client, not the other way)                                                                                    |

API Design Principles:

- OpenAPI 3.0 spec — generated via NestJS @nestjs/swagger decorators
- Versioning: URL-based (/api/v1/) — simplest, most explicit
- Tenant context: tenant_id extracted from JWT, never from the request body (prevents tenant spoofing)
- Idempotency: Transition requests include an idempotency_key header — duplicate requests are safely ignored

### 10.3 Section 3: Microservice Design Patterns Catalogue

#### Microservice Design Patterns — Applied or Not

Since we're building a Modular Monolith designed for microservice extraction, here's how each pattern applies:

| #   | Pattern               | Apply?                      | Justification                                                                                                                                                                                                                                                                                      |
| --- | --------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Circuit Breaker       | ✅ Yes                      | Wrap all outbound calls (notification service, webhooks, external rule evaluators) with circuit breaker using nestjs-resilience or opossum. Prevents cascade failures.                                                                                                                             |
| 2   | Saga Pattern          | ✅ Yes (Choreography-based) | A workflow transition involves: (a) update instance, (b) write audit log, (c) send notification. If step (c) fails, we don't rollback (a) and (b). Use Saga to handle compensation — emit event, notification service retries independently.                                                       |
| 3   | Strangler Fig         | ✅ Yes (Future)             | Start as modular monolith. As WorkflowExecutionModule becomes the bottleneck, extract it into its own service without touching other modules. The API Gateway routes to the new service transparently.                                                                                             |
| 4   | Database Per Service  | ✅ Architecturally Yes      | Each module owns its own repository layer and should not share table access across module boundaries. When extracted to microservices, each gets its own DB connection pool / schema.                                                                                                              |
| 5   | Aggregator Pattern    | ✅ Yes                      | The Instance Detail view needs data from: instance (Execution Module) + audit logs (Audit Module) + user names (Auth Module). A BFF (Backend for Frontend) aggregator assembles this before sending to client.                                                                                     |
| 6   | API Gateway Pattern   | ✅ Yes                      | Single entry point for all client traffic. Handles JWT validation, tenant extraction, rate limiting, request routing. Use AWS API Gateway or Kong in production.                                                                                                                                   |
| 7   | Sidecar Pattern       | ✅ Future                   | When running in Kubernetes — attach a sidecar container for log shipping (Fluentd), mTLS (Envoy/Istio), and metrics scraping (Prometheus) without changing application code.                                                                                                                       |
| 8   | CQRS Pattern          | ✅ Yes                      | Separate read and write models. Write operations go through the Execution Engine (command side, strongly consistent). Read operations (list instances, audit history) hit optimized read models / replicas (query side).                                                                           |
| 9   | Service Discovery     | ✅ Future                   | In a full microservice setup — use Kubernetes service DNS or Consul for services to find each other. In the monolith, in-process calls handle this.                                                                                                                                                |
| 10  | Service Mesh          | ⚠️ Future Only              | Istio/Linkerd is overengineering for initial build. Enable when you have 5+ services and need mutual TLS, traffic shaping, and distributed tracing between services automatically.                                                                                                                 |
| 11  | Event Sourcing        | ✅ Partial                  | The audit_logs table IS essentially an event log — every state change is a stored event. For full event sourcing, the current state of an instance would be recomputed by replaying audit events. We implement a hybrid: store current state for fast reads, but audit log is the source of truth. |
| 12  | Service Decomposition | ✅ Yes                      | Decompose by business capability: Auth, Tenant, Workflow Definition, Workflow Execution, Audit, Notification. Each has a single responsibility and clear bounded context.                                                                                                                          |
| 13  | Health Monitoring     | ✅ Yes                      | Each service exposes /health (liveness) and /health/ready (readiness) endpoints. Kubernetes probes these. Prometheus scrapes metrics. Grafana dashboards alert on SLA breaches.                                                                                                                    |
| 14  | Bulkhead Pattern      | ✅ Yes                      | Tenant-level rate limiting at the API Gateway — a noisy tenant can't consume all resources. Thread pool isolation for the Rule Engine evaluation (CPU-bound work) — separate from I/O-bound HTTP handlers.                                                                                         |
| 15  | REST Caching          | ✅ Yes                      | Cache GET /workflow-definitions/:id responses in Redis (TTL = 5 minutes, invalidated on publish). Use HTTP ETag + Cache-Control headers on responses.                                                                                                                                              |
| 16  | Polyglot Architecture | ✅ Yes                      | NestJS (TypeScript) for all services; PostgreSQL for relational data; Redis for caching; NATS for messaging. Each tool chosen for what it's best at — not one tech for everything.                                                                                                                 |

### 10.4 Section 4: Database Design

#### Is It Read-Heavy or Write-Heavy?

It is read-heavy, with write spikes.

| Operation                                     | Type  | Frequency                                             |
| --------------------------------------------- | ----- | ----------------------------------------------------- |
| Loading workflow definitions (designer view)  | Read  | Medium — only admins, infrequent                      |
| Listing instances (dashboard)                 | Read  | High — every user loads their queue on every login    |
| Loading instance detail + audit history       | Read  | High — every approver/requestor doing this constantly |
| Loading allowed transitions                   | Read  | High — every time a user views an instance            |
| Creating an instance                          | Write | Medium                                                |
| Executing a transition (state change + audit) | Write | Spiky — burst during business hours                   |
| Creating/updating workflow definitions        | Write | Low — admin-only, rare                                |

Strategy:

- Use read replicas in PostgreSQL (AWS RDS with Multi-AZ + Read Replicas)
- Cache workflow definitions aggressively in Redis (they change rarely)
- CQRS — separate read models for dashboards/lists from write models for execution

#### How must the DB be designed (scalability) and why?

Multi-tenant isolation choice

From the requirement, you may choose shared DB with tenant_id / schema per tenant / separate DB per tenant.

**problem**

Recommended default: Shared DB + tenant_id (row-level tenant partitioning)

Why:

- Fast onboarding (no provisioning per tenant)
- Easier operations (one cluster)
- Fits “many tenants” SaaS model

Can scale with:

- composite indexes (tenant_id, ...)
- partitioning by tenant_id or by time for audit tables
- read replicas

When schema-per-tenant or DB-per-tenant is justified:

- “Enterprise” tenants needing hard isolation, custom retention, or regulatory separation.

Core design principles

- Every table includes tenant_id
- Workflow definitions are versioned
- Instances reference a specific workflow definition version
- Audit log is append-only (no updates/deletes)

**problem**

Enforce concurrency using optimistic locking/version column or transactional row locks for state changes (prevents double approvals).

### 10.5 Section 5: Scalability Considerations

#### Scalability Considerations

| Concern                            | Solution                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| High instance volume per tenant    | Partition workflow_instances and audit_logs by tenant_id (PostgreSQL table partitioning)                         |
| Read-heavy audit log queries       | Separate read replica for audit log reads; writes go to primary                                                  |
| Definition caching                 | Cache workflow_definitions + workflow_states + workflow_transitions in Redis (TTL-based invalidation on publish) |
| tenant_id on every query           | Composite indexes on (tenant_id, created_at) on all main tables                                                  |
| Large tenants outgrowing shared DB | Design the schema to support tenant sharding — a routing table maps tenant_id to a database shard                |

### 10.6 Section 6: REFERENCES (Monolith vs Microservices, SQL vs NoSQL, Database Design)

#### 12. Microservice or Monolith?

##### Recommendation: **Modular Monolith first, architected for microservice extraction**

Here's the honest engineering reasoning:

| Factor                     | Monolith                 | Microservice                                         |
| -------------------------- | ------------------------ | ---------------------------------------------------- |
| **Development Speed**      | ✅ Faster to build       | ❌ Slower — infra overhead                           |
| **Operational Complexity** | ✅ Simple deployment     | ❌ Needs k8s, service discovery, distributed tracing |
| **Team Size**              | ✅ Works for small teams | ❌ Needs multiple teams                              |
| **Inter-service calls**    | ✅ In-process (fast)     | ❌ Network calls (latency, failures)                 |
| **Independent Scaling**    | ❌ Scale everything      | ✅ Scale only execution engine                       |
| **Fault Isolation**        | ❌ One crash, all down   | ✅ Isolated failures                                 |
| **Data Isolation**         | ✅ Simple queries        | ❌ Cross-service data management                     |

##### The Strategy: **Modular Monolith with hard module boundaries**

Build a NestJS monorepo where modules are:

- `AuthModule`
- `TenantModule`
- `WorkflowDefinitionModule`
- `WorkflowExecutionModule`
- `RuleEngineModule`
- `AuditModule`
- `NotificationModule`

Each module has its own service layer, repository, and never directly imports another module's repository. They communicate only through defined interfaces/events.

**This means**: When you need to scale, you extract a module into its own service — the code barely changes because boundaries were respected from day one. This is the **Strangler Fig pattern** applied proactively.

> The requirement asks for microservice design patterns — so we'll **design it as if it were microservices** (separate DBs, event-driven communication, CQRS) but **deploy it as a monolith** initially.

---

#### 13. SQL or NoSQL?

##### Recommendation: **PostgreSQL (SQL) as primary, with JSONB for flexible payloads**

Here's the reasoning:

| Criterion                                                                                                                                                        | Why PostgreSQL Wins Here                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Workflow definitions** have strict relational structure — states reference transitions, transitions reference rules — **foreign keys and joins are essential** | ✅ SQL                                                                          |
| **RBAC** — roles, users, permissions are deeply relational                                                                                                       | ✅ SQL                                                                          |
| **Audit logs** need guaranteed write ordering, immutability, and time-range queries                                                                              | ✅ SQL                                                                          |
| **Instance payloads** are tenant-specific flexible JSON blobs                                                                                                    | ✅ PostgreSQL **JSONB** handles this natively — indexes, queries on JSON fields |
| **Multi-tenancy with `tenant_id`** — row-level security is a first-class PostgreSQL feature                                                                      | ✅ SQL                                                                          |
| **ACID transactions** — a state transition must atomically update the instance AND write the audit log                                                           | ✅ SQL is essential here                                                        |
| **Concurrent transition protection** — optimistic locking via `version` column is native in SQL                                                                  | ✅ SQL                                                                          |

**Where NoSQL fits:**

- **Redis** — for caching workflow definitions (they rarely change, expensive to recompute), active user sessions, and rate limiting counters
- **Elasticsearch (future/stretch)** — for full-text search across audit logs and instance payloads at scale

**Summary:**

- **PostgreSQL** — source of truth for all data
- **Redis** — caching layer (workflow definitions, session tokens, rate limits)
- **NATS / AWS SQS** — async event bus (not a DB, but part of the data infrastructure)

---

#### 14. Database Design — Schema, Multi-Tenancy, and Scalability

##### Multi-Tenancy Strategy: **Shared Database, Shared Schema with `tenant_id`**

**Three options exist:**

| Strategy                       | Description                                                               | Pros                                      | Cons                                                        |
| ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| **Shared DB, Shared Schema**   | All tenants in same tables, `tenant_id` column everywhere                 | Simple, cheap, easy to scale horizontally | Accidental data leakage if `tenant_id` forgotten in queries |
| **Shared DB, Separate Schema** | Each tenant gets a Postgres schema (`acme.workflows`, `school.workflows`) | Strong isolation, no `tenant_id` needed   | Schema migrations need to run per tenant, complex           |
| **Separate DB per tenant**     | Each tenant has their own database                                        | Maximum isolation                         | Extremely expensive, complex connection pooling             |

**We choose: Shared DB, Shared Schema + PostgreSQL Row-Level Security (RLS)**

Why:

- **Row-Level Security** in PostgreSQL means the database itself enforces tenant isolation — even if your application code forgets to add `WHERE tenant_id = ?`, the DB rejects the query. This is a compliance-grade safeguard.
- **Cost effective** — one database cluster serves many tenants
- **Migrations are simple** — run once, applies to all tenants
- **Scalable** — can move a high-volume tenant to a dedicated read replica or eventually a separate DB (tenant sharding) when needed

### 10.7 Section 7: Rule Engine Mental Picture

#### Where and How Is Business Logic / Conditions Executed?

This is the most conceptually complex part. Let me paint the mental picture clearly.

##### The Problem

A Tenant Admin types this rule in the UI:

```ts
amount > 10000 AND user.department == "Engineering"
```

This is a string. How does the server execute it?

##### The Rule Engine — Mental Picture

Think of it like Excel formulas. When you type =SUM(A1:A10) in Excel, Excel has an interpreter that reads your string, understands it as an expression, and evaluates it against the cell data. You didn't write code — but Excel's engine runs logic on your behalf.

The Rule Engine in our system works the same way:

Step 1 — Storage: The rule is stored as a string (or structured JSON AST) in the database

```json
{
  "type": "AND",
  "conditions": [
    { "field": "payload.amount", "operator": ">", "value": 10000 },
    { "field": "user.department", "operator": "==", "value": "Engineering" }
  ]
}
```

Step 2 — Context Building: At runtime, the execution service builds a context object

```json
{
  "payload": { "amount": 15000, "vendor": "Acme" },
  "user": { "id": "u1", "role": "Requestor", "department": "Engineering" },
  "instance": { "current_state": "Draft", "created_at": "2026-01-01" }
}
```

**Step 3 — Evaluation**: The Rule Engine receives the rule AST + context, walks the tree, and evaluates:

```ts
amount(15000) > 10000 → TRUE
department("Engineering") == "Engineering" → TRUE
AND(TRUE, TRUE) → TRUE ✅ → Transition is allowed
```

**Step 4 — Decision**: Based on the result, the transition is either allowed or blocked.

##### Rule Engine Options

| Approach                                            | What it is                                      | When to use                                        |
| --------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| **JSON Rules Engine** (`json-rules-engine` library) | Pre-built evaluator for JSON-defined conditions | ✅ Best for this use case — fast, safe, extensible |
| **Expression evaluator** (`expr-eval`, `jexl`)      | Evaluates math/logic string expressions         | Good for power users who want formula-like syntax  |
| **Strategy Pattern (hardcoded)**                    | Write a TypeScript class per rule type          | Only if rules are few and fixed                    |
| **Sandboxed JS eval** (`vm2`, `isolated-vm`)        | Executes actual JS code written by tenant       | Powerful but dangerous — security risk             |

**We'll use `json-rules-engine`** — it's safe (no code injection risk), expressive, and the rule structure is serializable to the database.

### 10.8 Section 8: Business Point of View

#### Who Will Onboard the Platform?

B2B companies — businesses, not individual consumers. Examples:

| Industry              | Use Case                                       |
| --------------------- | ---------------------------------------------- |
| Finance / Procurement | Purchase approval, expense claims              |
| HR                    | Onboarding, offboarding, leave approvals       |
| Software / IT         | Bug lifecycle, change request management       |
| Healthcare            | Patient intake workflows, discharge approvals  |
| Legal                 | Contract review and sign-off workflows         |
| E-commerce            | Return/refund approval processes               |
| Education             | Admission workflows, faculty request approvals |

Each company onboards as a tenant. Their employees are tenant-level users. They define their own workflows, their own roles, their own rules — all within the shared platform.

### 10.9 Section 9: Actors and Personas

#### The Actors / Personas

There are two layers of actors:

##### Layer 1 — Platform Level (Your SaaS)

| Actor                        | Who They Are                      | What They Do                                                |
| ---------------------------- | --------------------------------- | ----------------------------------------------------------- |
| Super Admin / Platform Owner | You (the company that built this) | Onboards tenants, manages billing, monitors platform health |

##### Layer 2 — Tenant Level (Per Company)

| Actor             | Who They Are                    | What They Do                                                                |
| ----------------- | ------------------------------- | --------------------------------------------------------------------------- |
| Tenant Admin      | The IT/Ops manager of Company X | Creates workflow definitions, manages roles, users, and rules for their org |
| Approver          | A manager or senior person      | Reviews and approves/rejects workflow instances                             |
| Requestor         | An employee                     | Initiates a workflow instance (e.g., submits a purchase request)            |
| Viewer (optional) | Auditor, read-only stakeholder  | Can view instances and audit logs but cannot take action                    |

The Tenant Admin is the power user. The Requestor and Approver are the daily operators.

### 10.10 Section 10: Foundation

#### What is a workflow engine platform?

A workflow engine platform is a system that runs business processes described as:

- States (where something is now)
- Transitions (how it moves)
- Rules/conditions (when it’s allowed)
- Actors/roles (who can do it)
- History/audit (what happened)

It has two big halves:

- Workflow Definition (design-time): create/validate/version workflows
- Workflow Execution (run-time): start instances, advance steps, enforce rules, record audit

### 10.11 Section 11: Tenancy Models Available and Recommendation

#### Tenancy models available

- Shared DB, shared schema (tenant_id column everywhere)
- Shared DB, schema-per-tenant
- Separate DB per tenant

(Also sometimes: “separate cluster per tenant” for ultra-enterprise.)

| Model                         |        Isolation |    Cost | Operational Complexity |              Scalability | Best For                                     |
| ----------------------------- | ---------------: | ------: | ---------------------: | -----------------------: | -------------------------------------------- |
| Shared DB + shared schema     | Medium (logical) |  Lowest |                 Lowest | High (with partitioning) | 10k+ tenants, SaaS scale                     |
| Shared DB + schema-per-tenant |           Higher |  Medium |            Medium/High |                   Medium | Mid-size tenants needing stronger separation |
| Separate DB per tenant        |          Highest | Highest |                   High |              Medium/High | Regulated or large enterprise tenants        |

Which model is best here and why?

Default recommendation for your target (10k+ tenants, millions/day):
Shared DB + shared schema (tenant_id) + strong partitioning + encryption controls.

Why:

- Operationally feasible at 10k tenants
- Easier to scale horizontally (sharding/partitioning)
- Faster onboarding (no schema creation per tenant)
- Better for multi-tenant analytics and global ops

But: You must design isolation seriously:

- Row-level isolation (tenant_id enforced)
- Partitioning by tenant / time
- Per-tenant encryption context
- Strict authZ checks
- Audit immutability

Enterprise add-on:

Offer DB-per-tenant as a premium tier for HIPAA/financial customers when required.

How do we isolate data securely?

Use defense-in-depth:

- AuthN: tenant-aware identity (JWT contains tenant_id)
- AuthZ: RBAC + per-workflow permissions
- Mandatory tenant filter: every query scoped by tenant_id (enforced centrally)
- Row-level security (optional) at DB for extra safety

Encryption:

- at rest (KMS-managed)
- in transit (TLS)
- optional per-tenant keys / encryption context

- No cross-tenant logging: logs and traces must carry tenant_id and be access-controlled
- Rate limits per tenant to prevent noisy neighbor

### 10.12 Section 12: Workflow Execution Model

Workflow Execution Model

#### 17) Where are workflows stored?

In your platform persistence:

- Workflow Definition (versioned): states, transitions, rules, role permissions
- Definition metadata: published/draft, version graph, validation status

#### 18. Where are workflows executed?

In the workflow runtime/execution service:

- It loads the definition (by version)
- Applies transitions on instances
- Writes state updates + audit entries
- Emits events to messaging

Execution is stateless compute + durable persistence.

#### 19. Execution lifecycle (core)

- Definition created → validated → published (version locked)
- Instance created from a definition version
- Instance waits in a state
- A transition request arrives (user action or system event)

Engine checks:

- allowed role?
- condition true?
- concurrency safe?

Engine persists:

- new state
- task updates
- immutable audit record

Engine emits events/webhooks

#### 20. Where does business logic live?

Three tiers (important mental model):

Engine invariants (platform-owned):

- state machine rules, idempotency, concurrency, audit immutability

Tenant configuration (data, not code):

- states/transitions/conditions/roles

Tenant domain logic (outside engine):

- “reserve inventory”, “create invoice”, “update student attendance”
- done via connectors (HTTP, queues, workers, webhooks)

This is how “school vs e-commerce” both work: the engine orchestrates; domain logic runs in tenant systems or tenant-specific workers.

#### 21. How are conditions evaluated?

A rule evaluator that takes:

- transition request
- instance data (custom fields)
- user context (roles)
- possibly external facts (fetched via connector)

Common approach:

- expression-based rules (safe DSL)
- plus “pluggable predicates” for advanced enterprise needs

#### 22. Interpreted or compiled?

For a SaaS workflow designer:

- Interpreted is the standard: flexible, safe, easy to version and audit.
- “Compiled” only makes sense if you generate code or bytecode—adds risk and complexity.

Recommendation: interpreted rules + strict sandboxing.

#### 23. Mental execution flow (trigger → orchestration → task → completion)

Trigger

- User clicks “Submit”
- Or external event arrives (“payment_succeeded”)

Orchestration

- Engine loads definition vN
- Finds valid next transitions

Task execution

- If transition includes “call external system”, it enqueues a task/event
- Worker executes and reports back

Completion

- Engine applies resulting transition
- Writes audit
- Emits notifications/events

---

> 📐 **[DIAGRAM PLACEHOLDER]**  
> _Type:_ Architecture Diagram  
> _Description:_ High-level module and contract relationships (auth, tenant, workflow-definition, workflow-execution, rule-engine, audit, notification, database, infra) showing contracts and NATS flows.  
> _To be created separately._

> 📐 **[DIAGRAM PLACEHOLDER]**  
> _Type:_ Sequence Diagram  
> _Description:_ Create instance → execute transition → audit log and notification fan-out (including RLS and caching layers).  
> _To be created separately._

> 📐 **[DIAGRAM PLACEHOLDER]**  
> _Type:_ ER Diagram  
> _Description:_ Core relational schema for tenants, users, workflow-definitions, workflow-instances, and audit logs (highlighting tenant*id and RLS).  
> \_To be created separately.*
