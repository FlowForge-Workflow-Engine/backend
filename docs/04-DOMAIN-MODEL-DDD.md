---
title: Domain Model / DDD Design
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# Domain Model / DDD Design

This document captures the domain using Domain-Driven Design building blocks. It defines the bounded contexts, aggregates, entities, value objects, domain events, repositories, domain services, application services, factories, and the ubiquitous language — all derived directly from the implemented codebase.

---

## Table of Contents

- [1. Overview & DDD Primer](#1-overview--ddd-primer)
- [2. Bounded Contexts](#2-bounded-contexts)
  - [2.1 Context Map](#21-context-map)
- [3. Aggregates](#3-aggregates)
  - [3.1 WorkflowDefinition Aggregate](#31-workflowdefinition-aggregate)
  - [3.2 WorkflowInstance Aggregate](#32-workflowinstance-aggregate)
  - [3.3 Tenant Aggregate](#33-tenant-aggregate)
  - [3.4 User Aggregate](#34-user-aggregate)
  - [3.5 AuditLog Aggregate](#35-auditlog-aggregate)
  - [3.6 NotificationConfig Aggregate](#36-notificationconfig-aggregate)
- [4. Entities (Non-Root)](#4-entities-non-root)
- [5. Value Objects](#5-value-objects)
- [6. Domain Events](#6-domain-events)
- [7. Repositories](#7-repositories)
- [8. Domain Services](#8-domain-services)
- [9. Application Services](#9-application-services)
- [10. Factories](#10-factories)
- [11. Ubiquitous Language Glossary](#11-ubiquitous-language-glossary)

---

## 1. Overview & DDD Primer

**Domain-Driven Design (DDD)** is a software design approach that centres development around a rich model of the problem domain, expressed through a shared language between engineers and domain experts. The key building blocks used in this system are:

- **Bounded Context** — A named boundary within which a particular domain model is defined and applicable. Different bounded contexts may use the same word with different meanings.
- **Aggregate** — A cluster of domain objects treated as a single unit for data changes. Every aggregate has an **Aggregate Root** — the only object through which the cluster may be accessed from outside.
- **Entity** — An object with a distinct, persistent identity. Two entities are the same if they share the same identity, regardless of their attribute values.
- **Value Object** — An object defined entirely by its attribute values. It has no identity of its own and is immutable. Two value objects are equal if all their properties are equal.
- **Domain Event** — A record of something that happened in the domain. Events are immutable, named in the past tense, and carry the data that describes what occurred.
- **Repository** — An abstraction that provides collection-like access to aggregate roots. Persistence concerns are hidden behind the repository interface.
- **Domain Service** — Stateless logic that does not naturally belong to any single entity or value object, often coordinating multiple aggregates.
- **Application Service** — Orchestrates use cases by calling domain objects, repositories, and domain services. It handles transaction management and event publishing.
- **Factory** — Encapsulates the complex creation logic of aggregates or entities.

This system applies these patterns pragmatically within a modular NestJS monolith. Not every module is a full DDD aggregate — some are supporting contexts (Rule Engine, Audit, Notification) that primarily react to events from the core domain. The **Core Domain** is the Workflow Execution Context — it is where the competitive differentiation lives.

---

## 2. Bounded Contexts

| Context                | Module(s)                                       | Core Responsibility                                                                           |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Identity & Access**  | `AuthModule`                                    | User identity, credential management, JWT issuance, RBAC role assignment                      |
| **Tenancy**            | `TenantModule`                                  | Tenant lifecycle, plan management, feature flags, tenant settings                             |
| **Workflow Design**    | `WorkflowDefinitionModule`                      | Workflow definition authoring, state/transition modelling, rule authoring, version publishing |
| **Workflow Execution** | `WorkflowExecutionModule`                       | Instance lifecycle, state transitions, optimistic concurrency, snapshot-pinned execution      |
| **Rule Evaluation**    | `RuleEngineModule`                              | Stateless evaluation of JSON AST rules against a runtime context                              |
| **Audit**              | `AuditModule`                                   | Immutable, append-only audit trail of all domain events                                       |
| **Notification**       | `NotificationModule`                            | Email and webhook delivery triggered by domain events                                         |
| **Infrastructure**     | `DatabaseModule`, `InfraModule`, `HealthModule` | Database connectivity, RLS context, Redis, NATS, health probes                                |

### 2.1 Context Map

The relationships between contexts follow strict DDD integration patterns to preserve module boundaries and enable future microservice extraction:

```
┌───────────────────────────────────────────────────────────────┐
│                        Core Domain                            │
│                                                               │
│   ┌──────────────────────┐      ┌──────────────────────────┐  │
│   │  Workflow Design     │─────▶│  Workflow Execution      │  │
│   │  (Upstream / OHS)    │      │  (Downstream / ACL)      │  │
│   └──────────────────────┘      └──────────────────────────┘  │
│           │                                │                  │
│           │ publishes                      │ publishes        │
│           ▼                                ▼                  │
│       NATS events                      NATS events            │
└───────────┬────────────────────────────────┬──────────────────┘
            │                                │
    ┌───────┴──────┐                ┌────────┴────────┐
    │    Audit     │                │  Notification   │
    │  (Conformist)│                │  (Conformist)   │
    └──────────────┘                └─────────────────┘

Supporting Contexts (Partnership / Shared Kernel):
┌─────────────────────┐   ┌─────────────────────┐   ┌──────────────┐
│  Identity & Access  │   │      Tenancy        │   │ Rule Engine  │
│  (Upstream / OHS)   │   │  (Upstream / OHS)   │   │ (ACL / plug) │
└─────────────────────┘   └─────────────────────┘   └──────────────┘
```

**Relationship types:**

| Upstream Context   | Downstream Context | Pattern                                       | Integration Mechanism                                                                         |
| ------------------ | ------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Identity & Access  | Workflow Execution | **Open Host Service / Anti-Corruption Layer** | `USER_QUERY_CONTRACT` Symbol token; `we_user_shadows` shadow table synced via NATS            |
| Identity & Access  | Tenancy            | **Customer/Supplier**                         | `TENANT_PROVISIONING_CONTRACT` Symbol token — AuthModule calls TenantModule to create tenants |
| Tenancy            | Identity & Access  | **Open Host Service**                         | `TENANT_QUERY_CONTRACT` Symbol token — AuthModule reads tenant plan/slug at JWT issuance      |
| Tenancy            | Workflow Execution | **Open Host Service**                         | `TENANT_QUERY_CONTRACT` Symbol token                                                          |
| Workflow Design    | Workflow Execution | **Open Host Service / Anti-Corruption Layer** | `WORKFLOW_QUERY_CONTRACT` Symbol token — Execution reads snapshots, never live rows           |
| Workflow Execution | Rule Evaluation    | **Partnership**                               | `RULE_ENGINE_CONTRACT` Symbol token — synchronous, stateless evaluation call                  |
| Workflow Execution | Audit              | **Published Language / Conformist**           | NATS events; Audit subscribes, never influences Execution                                     |
| Workflow Execution | Notification       | **Published Language / Conformist**           | NATS events; Notification subscribes, never influences Execution                              |
| Workflow Design    | Audit              | **Published Language / Conformist**           | NATS `workflow-definition.published` / `deprecated` events                                    |
| Identity & Access  | Audit              | **Published Language / Conformist**           | NATS `auth.user.*` events                                                                     |
| Tenancy            | Audit              | **Published Language / Conformist**           | NATS `tenant.*` events                                                                        |
| All Contexts       | Infrastructure     | **Shared Kernel**                             | `libs/shared` — `BaseEntity`, guards, decorators, interfaces, error constants                 |

**Key anti-corruption layer (ACL) pattern:** `WorkflowExecutionModule` never reads from `workflow_definitions`, `workflow_states`, or `workflow_transitions` tables directly. It consumes the domain through the `IWorkflowQueryContract` interface, which returns immutable JSONB snapshots. This ACL prevents the Execution context from coupling to the Design context's internal schema — when Workflow Design evolves its schema, Execution remains unaffected as long as the snapshot contract is honoured.

---

## 3. Aggregates

### 3.1 WorkflowDefinition Aggregate

#### Aggregate Root

**`WorkflowDefinition`** — `src/modules/workflow-definition/entities/workflow-definition.entity.ts`

The `WorkflowDefinition` is the entry point for all design-time changes. No state, transition, rule, or version may be modified without going through the definition. Its status lifecycle (`draft → published → deprecated`) governs whether new instances may be created from it.

#### Entities Within

| Entity                      | File                                             | Role Within Aggregate                                                                         |
| --------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `WorkflowState`             | `entities/workflow-state.entity.ts`              | A named node in the state graph; carries `isInitial` and `isTerminal` flags                   |
| `WorkflowTransition`        | `entities/workflow-transition.entity.ts`         | A directed edge between two states; carries role constraints and comment requirements         |
| `TransitionRule`            | `entities/transition-rule.entity.ts`             | A business rule guard on a transition; stores a JSON AST in the `ruleDefinition` JSONB column |
| `WorkflowDefinitionVersion` | `entities/workflow-definition-version.entity.ts` | An immutable snapshot of the full definition graph at a specific point in time                |
| `InstanceFormSchema`        | `entities/instance-form-schema.entity.ts`        | The accumulated form field schema for instances of this definition                            |

#### Value Objects Within

| Value Object               | Represented As                               | Properties                                            | Notes                                                          |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `WorkflowDefinitionStatus` | TypeScript enum                              | `draft`, `published`, `deprecated`                    | Governs whether new instances may be created                   |
| `VersionSnapshot`          | `JSONB` field on `WorkflowDefinitionVersion` | `{ id, name, states[], transitions[{ ...rules[] }] }` | Immutable once written; cached indefinitely                    |
| `RuleDefinition`           | `JSONB` field on `TransitionRule`            | `ExpressionRuleDefinition \| CustomRuleDefinition`    | Either a json-rules-engine AST or a custom strategy descriptor |
| `AllowedRoleIds`           | `uuid[]` column on `WorkflowTransition`      | Array of role UUIDs                                   | Empty array means open to all authenticated users              |

#### Invariants Enforced

1. **Exactly one initial state:** A definition must have exactly one state with `isInitial = true` before it can be published. `WorkflowVersionService.publish()` throws `UnprocessableEntityException(WORKFLOW_INITIAL_STATE_REQUIRED)` if none is found in the snapshot's `states[]` array.
2. **Published definitions are immutable:** Once a definition reaches `status = PUBLISHED`, its states, transitions, and rules must not be changed. A new publish creates a new version. Attempting to publish an already-published definition requires deprecating it first and re-editing a draft.
3. **Version number monotonically increases:** `WorkflowDefinition.currentVersion` starts at `1` and is incremented after every successful publish. The database `UNIQUE(workflowDefinitionId, versionNumber)` constraint enforces uniqueness at the storage layer.
4. **At most one active version:** `WorkflowVersionService.publish()` calls `versionRepository.deactivateAll(definitionId, tenantId)` before creating the new active version. Only one `WorkflowDefinitionVersion` with `isActive = true` exists per definition at any time.
5. **Rules belong to a transition:** `TransitionRule.transitionId` is a non-nullable UUID. Rules cannot exist without a parent transition.
6. **Tenant scoping:** All entities within the aggregate share the same `tenantId`, enforced by `BaseEntity.tenantId` and PostgreSQL RLS.

#### Repository Interface

```typescript
// Provided by WorkflowDefinitionModule via WORKFLOW_QUERY_CONTRACT
interface IWorkflowQueryContract {
  findDefinitionById(definitionId: string, tenantId: string): Promise<WorkflowDefinitionSummary | null>;
  countDefinitionsByTenant(tenantId: string): Promise<number>;
  countPublishedDefinitionsByTenant(tenantId: string): Promise<number>;
  getVersionSnapshot(definitionId: string, version: number, tenantId: string): Promise<Record<string, unknown> | null>;
  getInstanceFormSchema(definitionId: string, tenantId: string): Promise<WorkflowInstanceFormSchema>;
}

// Internal repositories (never exposed outside WorkflowDefinitionModule)
WorkflowDefinitionRepository   — CRUD for workflow_definitions
WorkflowStateRepository         — CRUD for workflow_states
WorkflowTransitionRepository    — CRUD for workflow_transitions
TransitionRuleRepository        — CRUD for transition_rules
WorkflowVersionRepository       — CRUD for workflow_definition_versions
InstanceFormSchemaRepository    — CRUD for instance_form_schemas
```

---

### 3.2 WorkflowInstance Aggregate

#### Aggregate Root

**`WorkflowInstance`** — `src/modules/workflow-execution/entities/workflow-instance.entity.ts`

`WorkflowInstance` is the central runtime object. It holds the current position in the state machine (`currentStateId`, `currentStateName`), the instance's business data (`payload` JSONB), its lifecycle status, and the `version` counter used for optimistic locking. All state mutations flow through `ExecuteTransitionCommand` — there is no direct field mutation path.

#### Entities Within

| Entity         | File                                | Role Within Aggregate                                                                                                                          |
| -------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `WeUserShadow` | `entities/we-user-shadow.entity.ts` | A local read model of user identity data (email, fullName, roles) maintained by the execution module to avoid cross-module joins at query time |

`WeUserShadow` is not a traditional DDD entity within the aggregate in the sense of being created or destroyed by instance operations — it is a **shadow read model** maintained via NATS events from the Identity context. It is included here because it lives inside the `WorkflowExecutionModule`'s bounded context and is queried alongside instance data.

#### Value Objects Within

| Value Object             | Represented As                                            | Properties                         | Notes                                                                                          |
| ------------------------ | --------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `WorkflowInstanceStatus` | TypeScript enum                                           | `active`, `completed`, `cancelled` | Terminal value — once `completed` or `cancelled`, no further transitions are accepted          |
| `InstancePayload`        | `JSONB` column                                            | `Record<string, unknown>`          | Arbitrary business data submitted at instance creation; validated against `InstanceFormSchema` |
| `DefinitionVersionRef`   | Two columns: `workflowDefinitionId` + `definitionVersion` | `(UUID, integer)`                  | Identifies the exact immutable snapshot used for this instance's entire lifecycle              |
| `CurrentStateRef`        | Two columns: `currentStateId` + `currentStateName`        | `(UUID, varchar)`                  | Denormalised for read performance; authoritative position in the state graph                   |

#### Invariants Enforced

1. **Optimistic locking — one transition at a time:** `ExecuteTransitionHandler` performs an atomic SQL UPDATE with `WHERE id = $instanceId AND version = $lastKnownVersion AND tenant_id = $tenantId`. If `rowsAffected = 0`, another concurrent writer already changed the instance and `ConflictException(TRANSITION_CONFLICT)` is thrown.
2. **Only ACTIVE instances can transition:** Step 1 of `ExecuteTransitionHandler` checks `instance.status === ACTIVE`. Completed or cancelled instances are immutable.
3. **Transition must originate from the current state:** Step 3 checks `transition.fromStateId === instance.currentStateId` using the pinned snapshot. A transition that was valid from a different state is rejected.
4. **Snapshot-pinned execution:** Once created, an instance is permanently bound to `definitionVersion`. `WorkflowVersionService.publish()` creates a new version — it never modifies an existing snapshot. Running instances are therefore unaffected by definition re-publishes.
5. **Terminal state auto-completes the instance:** When a transition leads to a state with `isTerminal = true`, the handler sets `status = COMPLETED` and `completedAt = NOW()` atomically in the same UPDATE statement.
6. **Payload validated at creation:** `CreateInstanceHandler` calls `workflowQuery.getInstanceFormSchema()` and validates the submitted payload against required fields before persisting the instance. Missing required fields produce `UnprocessableEntityException(WORKFLOW_INSTANCE_REQUIRED_FIELDS_MISSING)` with the specific missing field keys.
7. **Idempotent transitions:** `ExecuteTransitionHandler` uses a Redis `SETNX` lock keyed on the client-supplied `idempotencyKey`. A second request with the same key within the TTL window receives the cached result of the first execution, not a duplicate transition.

#### Repository Interface

```typescript
// Internal to WorkflowExecutionModule
interface WorkflowInstanceRepository {
  findByIdAndTenant(id: string, tenantId: string): Promise<WorkflowInstance | null>;
  findAllByTenant(tenantId: string, filters: InstanceFilters): Promise<[WorkflowInstance[], number]>;
  countByTenant(tenantId: string): Promise<number>;
  create(data: Partial<WorkflowInstance>): WorkflowInstance;
  save(instance: WorkflowInstance): Promise<WorkflowInstance>;
}

// Exposed externally via WORKFLOW_EXECUTION_QUERY_CONTRACT
interface IWorkflowExecutionQueryContract {
  countActiveInstancesByTenant(tenantId: string): Promise<number>;
}
```

---

### 3.3 Tenant Aggregate

#### Aggregate Root

**`Tenant`** — `src/modules/tenant/entities/tenant.entity.ts`

`Tenant` is the root of the tenancy bounded context. It is the only entity in the system that does not carry a `tenantId` column — it _is_ the tenant. Its `id` is the `tenantId` referenced by every other table in the system.

#### Entities Within

| Entity              | File                                     | Role Within Aggregate                                                                                               |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `TenantSettings`    | `entities/tenant-settings.entity.ts`     | Per-tenant configuration (max users, max workflow definitions, timezone, branding JSONB). One-to-one with `Tenant`. |
| `TenantFeatureFlag` | `entities/tenant-feature-flag.entity.ts` | Named boolean toggles per tenant (e.g., `enable_webhooks`, `enable_audit_export`). Many-to-one with `Tenant`.       |

#### Value Objects Within

| Value Object     | Represented As                    | Properties                                  | Notes                                                                     |
| ---------------- | --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| `TenantPlan`     | TypeScript enum                   | `free`, `pro`, `enterprise`                 | Embedded in JWT at login; governs feature access                          |
| `TenantSlug`     | `varchar(100) UNIQUE`             | URL-friendly lowercase identifier           | Immutable after creation; used for tenant resolution at self-registration |
| `BrandingConfig` | `JSONB` field on `TenantSettings` | `{ primaryColor?, logoUrl?, companyName? }` | Optional display configuration for white-label use cases                  |

#### Invariants Enforced

1. **Slug uniqueness across all tenants:** `TenantProvisioningService.provision()` checks `existsBySlug(slug)` and throws `ConflictException(TENANT_SLUG_TAKEN)` before creating the tenant record.
2. **Default settings bootstrapped on creation:** `TenantProvisioningService` always calls `tenantSettingsRepository.upsert(tenantId, {})` immediately after creating the tenant — a tenant can never exist without a settings row.
3. **Feature flag uniqueness:** A `UNIQUE(tenant_id, flagKey)` constraint prevents duplicate feature flag entries for the same tenant.
4. **Tenant cannot be deleted, only deactivated:** Tenant deactivation sets `isActive = false`. There is no hard-delete path — all tenant data is retained for audit and compliance purposes.

#### Repository Interface

```typescript
// Exposed externally via TENANT_QUERY_CONTRACT
interface ITenantQueryContract {
  findById(tenantId: string): Promise<TenantSummary | null>;
  findBySlug(slug: string): Promise<TenantSummary | null>;
  isFeatureEnabled(tenantId: string, flagKey: string): Promise<boolean>;
  getPlan(tenantId: string): Promise<string>;
}

// Exposed externally via TENANT_PROVISIONING_CONTRACT (write side)
interface ITenantProvisioningContract {
  provision(dto: { name: string; slug: string; plan?: string }): Promise<TenantProvisioningResult>;
}

// Internal
TenantRepository              — CRUD for tenants
TenantSettingsRepository      — Upsert/read for tenant_settings
TenantFeatureFlagRepository   — CRUD for tenant_feature_flags
```

---

### 3.4 User Aggregate

#### Aggregate Root

**`User`** — `src/modules/auth/entities/user.entity.ts`

`User` is the identity root. It owns the credential (`passwordHash`) and the role assignment relationships. A user's identity is always scoped to a single tenant — there is no global (cross-tenant) user identity in this system.

#### Entities Within

| Entity         | File                               | Role Within Aggregate                                                                                                                       |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserRole`     | `entities/user-role.entity.ts`     | Junction entity linking a `User` to a `Role` within a tenant. Carries `assignedBy` and `assignedAt` metadata.                               |
| `Role`         | `entities/role.entity.ts`          | A named permission grouping within a tenant (e.g., `Admin`, `Approver`). Has `isSystemRole` flag for built-in roles that cannot be deleted. |
| `Permission`   | `entities/permission.entity.ts`    | A granular `(resource, action)` pair. Global — not tenant-scoped.                                                                           |
| `RefreshToken` | `entities/refresh-token.entity.ts` | A persisted record of an issued refresh token, stored as its SHA-256 hash. Carries `expiresAt` and `revokedAt`.                             |

#### Value Objects Within

| Value Object   | Represented As                                           | Properties                                                                  | Notes                                                                             |
| -------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `PasswordHash` | `varchar(255)` column                                    | Argon2id hash of the raw password                                           | `@Exclude()` — never serialised in API responses                                  |
| `TokenHash`    | `varchar(255) UNIQUE` column on `RefreshToken`           | SHA-256 of the raw opaque refresh token                                     | Raw token is never stored; only the hash                                          |
| `EmailAddress` | `varchar(255)` with `UNIQUE(tenantId, email)` constraint | Unique per tenant                                                           | Duplicate emails across tenants are allowed; duplicate within a tenant are not    |
| `JwtPayload`   | Transient — encoded into JWT                             | `{ sub, email, firstName, tenantId, tenantSlug, roles[], roleIds[], plan }` | Read-only snapshot of user state at login time; zero DB calls for downstream auth |

#### Invariants Enforced

1. **Email uniqueness within a tenant:** `UNIQUE(tenant_id, email)` database constraint. `UserRepository` checks existence before insert and surfaces a `ConflictException`.
2. **Inactive users cannot authenticate:** `AuthService.login()` checks `user.isActive` before verifying the password. The same generic `UnauthorizedException('Invalid credentials')` is thrown whether the user is not found, inactive, or has a wrong password — preventing user enumeration.
3. **Refresh token rotation on every use:** `AuthService.refresh()` revokes the consumed token (`revokedAt = NOW()`) and issues a new pair atomically. Replaying a used refresh token fails with `401`.
4. **Password never exposed:** `User.passwordHash` carries `@Exclude()` from `class-transformer`. `ClassSerializerInterceptor` (global) strips it from all response serialisations.
5. **Roles always reloaded at token refresh:** `AuthService.refresh()` calls `UserRepository.findByIdWithRoles()` — the fresh `roles[]` and `roleIds[]` in the new JWT reflect any role changes made since the last login.

#### Repository Interface

```typescript
// Exposed externally via USER_QUERY_CONTRACT
interface IUserQueryContract {
  findById(userId: string, tenantId: string): Promise<UserSummary | null>;
  findManyByIds(userIds: string[], tenantId: string): Promise<UserSummary[]>;
  countByTenant(tenantId: string): Promise<number>;
  existsWithRole(userId: string, tenantId: string, role: string): Promise<boolean>;
}

// Internal
UserRepository              — CRUD + findByEmailAndTenant + findByIdWithRoles
RefreshTokenRepository      — findByHash + revoke + create
RoleRepository              — CRUD + findByTenantWithPermissions
```

---

### 3.5 AuditLog Aggregate

#### Aggregate Root

**`AuditLog`** — `src/modules/audit/entities/audit-log.entity.ts`

`AuditLog` is a degenerate aggregate with no child entities — each log row is a complete, self-contained record of a single domain event. It is append-only; no other aggregate or service modifies it. Its immutability is enforced at the database level via a PostgreSQL trigger that raises an exception on any `UPDATE` or `DELETE`.

#### Value Objects Within

| Value Object    | Represented As                                      | Properties                                                                                                                                                                                                                                                                        | Notes                                                                                    |
| --------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ActionType`    | PostgreSQL enum + TypeScript enum                   | `instance_created`, `transition_executed`, `instance_completed`, `instance_cancelled`, `user_created`, `user_deactivated`, `user_roles_updated`, `tenant_created`, `tenant_deactivated`, `tenant_plan_updated`, `workflow_definition_published`, `workflow_definition_deprecated` | Exactly 12 values — one per recognised domain event type                                 |
| `ActorSnapshot` | Columns `actor_email`, `actor_role`                 | String snapshots of actor identity at event time                                                                                                                                                                                                                                  | Stored as strings, not FKs — because the user's email or role may change after the event |
| `StateSnapshot` | Columns `from_state`, `to_state`, `transition_name` | String snapshots of workflow state at event time                                                                                                                                                                                                                                  | Same rationale — state names may be renamed in future definition versions                |
| `EventId`       | `uuid UNIQUE NOT NULL`                              | UUID matching the `eventId` from the NATS event payload                                                                                                                                                                                                                           | Idempotency key — prevents duplicate audit rows on NATS message replay                   |

#### Invariants Enforced

1. **Immutability at database level:** PostgreSQL trigger `audit_logs_immutability_trigger` executes `RAISE EXCEPTION` on any `BEFORE UPDATE OR DELETE` on the `audit_logs` table. This is independent of application code.
2. **Idempotent writes:** `AuditLogRepository.insertIfAbsent(eventId, ...)` checks for an existing row before inserting. The `UNIQUE(event_id)` constraint provides a database-level backstop against races.
3. **No `updatedAt` column:** `AuditLog` does not extend `BaseEntity` — it has no `updatedAt` timestamp, because an audit record should never be updated.
4. **Subscriber errors do not propagate:** `AuditSubscriber` catches and logs persistence errors but does not re-throw them. Audit failure never blocks the domain operation that produced the event.

#### Repository Interface

```typescript
// Internal to AuditModule
interface AuditLogRepository {
  insertIfAbsent(eventId: string, tenantId: string, data: Partial<AuditLog>): Promise<boolean>;
  findByInstanceAndTenant(
    instanceId: string,
    tenantId: string,
    pagination: PaginationOptions,
  ): Promise<[AuditLog[], number]>;
}
```

---

### 3.6 NotificationConfig Aggregate

#### Aggregate Root

**`WebhookConfig`** — `src/modules/notification/entities/webhook-config.entity.ts`

`WebhookConfig` is the root for notification delivery configuration. It owns the webhook endpoint URL, the HMAC signing secret, and the list of event triggers this webhook subscribes to.

`NotificationTemplate` is treated as a co-equal root within the Notification context — it owns the Pug template body and event trigger mapping for email delivery. Both `WebhookConfig` and `NotificationTemplate` are managed independently by tenant admins.

#### Entities Within

| Entity                 | File                                       | Role Within Aggregate                                   |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------- |
| `NotificationTemplate` | `entities/notification-template.entity.ts` | A Pug-rendered email template keyed to an event trigger |
| `NotificationLog`      | `entities/notification-log.entity.ts`      | A delivery attempt record for an email notification     |
| `WebhookDeliveryLog`   | `entities/webhook-delivery-log.entity.ts`  | An HTTP delivery attempt record for a webhook call      |

#### Value Objects Within

| Value Object          | Represented As                        | Properties                          | Notes                                         |
| --------------------- | ------------------------------------- | ----------------------------------- | --------------------------------------------- |
| `NotificationChannel` | PostgreSQL enum                       | `email`, `webhook`                  | Determines delivery mechanism                 |
| `NotificationStatus`  | PostgreSQL enum                       | `pending`, `sent`, `failed`         | Delivery outcome                              |
| `WebhookSignature`    | Computed at delivery time             | `HMAC-SHA256(payload, secret)`      | Never persisted — computed fresh per delivery |
| `EventTriggerList`    | `varchar[]` column on `WebhookConfig` | Array of NATS event pattern strings | Determines which events activate this webhook |

#### Invariants Enforced

1. **Default templates bootstrapped on tenant creation:** `NotificationTemplateBootstrapService.onModuleInit()` (or via `NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT`) seeds five standard Pug templates for every new tenant: `tenant.created`, `workflow-execution.instance.created`, `workflow-execution.transition.completed`, `workflow-execution.instance.completed`, `workflow-execution.instance.cancelled`.
2. **Webhook delivery is fire-and-forget:** Delivery failures are logged in `WebhookDeliveryLog` but do not cause exceptions that propagate to the subscriber. Retry logic is handled at the subscriber layer.
3. **HMAC signature required:** `WebhookService.deliver()` always computes and attaches an `X-Signature` header. There is no unsigned webhook delivery path.

---

## 4. Entities (Non-Root)

The following entities exist within aggregates but are never accessed directly from outside their aggregate's module:

| Entity                      | Belongs To Aggregate | Key Attributes                                                                                                | Identity                                                   |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `WorkflowState`             | WorkflowDefinition   | `name`, `isInitial`, `isTerminal`, `positionX`, `positionY`, `metadata` JSONB                                 | UUID PK; unique within a definition's graph                |
| `WorkflowTransition`        | WorkflowDefinition   | `name`, `fromStateId`, `toStateId`, `allowedRoleIds[]`, `requiresComment`                                     | UUID PK; directed edge between two states                  |
| `TransitionRule`            | WorkflowDefinition   | `ruleName`, `ruleDefinition` JSONB, `evaluationOrder`                                                         | UUID PK; ordered rule guard on a transition                |
| `WorkflowDefinitionVersion` | WorkflowDefinition   | `versionNumber`, `snapshot` JSONB, `isActive`, `publishedBy`, `publishedAt`                                   | UUID PK; unique on `(workflowDefinitionId, versionNumber)` |
| `InstanceFormSchema`        | WorkflowDefinition   | `schema` JSONB (accumulated fields from rule authoring)                                                       | UUID PK; unique on `workflowDefinitionId`                  |
| `WeUserShadow`              | WorkflowInstance     | `email`, `fullName`, `roles[]`, `isActive`, `syncedAt`                                                        | UUID PK; mirrors the `users.id` from Identity context      |
| `UserRole`                  | User                 | `userId`, `roleId`, `assignedBy`, `assignedAt`                                                                | Composite PK `(userId, roleId)`                            |
| `Role`                      | User                 | `name`, `description`, `isSystemRole`                                                                         | UUID PK; unique on `(tenantId, name)`                      |
| `Permission`                | User                 | `resource`, `action`, `description`                                                                           | UUID PK; global (no `tenantId`)                            |
| `RefreshToken`              | User                 | `tokenHash`, `expiresAt`, `revokedAt`                                                                         | UUID PK; unique on `tokenHash`                             |
| `TenantSettings`            | Tenant               | `maxWorkflowDefinitions`, `maxUsers`, `branding` JSONB, `timezone`                                            | UUID PK; unique on `tenantId`                              |
| `TenantFeatureFlag`         | Tenant               | `flagKey`, `isEnabled`, `config` JSONB                                                                        | UUID PK; unique on `(tenantId, flagKey)`                   |
| `NotificationTemplate`      | NotificationConfig   | `eventTrigger`, `channel`, `subjectTemplate`, `bodyTemplate`, `isActive`                                      | UUID PK                                                    |
| `NotificationLog`           | NotificationConfig   | `templateId`, `recipientEmail`, `channel`, `status`, `retryCount`, `errorMessage`, `sentAt`                   | UUID PK                                                    |
| `WebhookDeliveryLog`        | NotificationConfig   | `webhookConfigId`, `eventName`, `payload` JSONB, `httpStatus`, `responseBody`, `attemptNumber`, `deliveredAt` | UUID PK                                                    |

---

## 5. Value Objects

Value objects in this system are expressed as TypeScript enums, interfaces, computed fields, or JSONB columns rather than as separate class hierarchies — this is appropriate for a NestJS/TypeORM context where rich value object classes would add ceremonial overhead without benefit:

| Value Object               | Aggregate          | Properties                                                                  | Immutable?                                         |
| -------------------------- | ------------------ | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `WorkflowDefinitionStatus` | WorkflowDefinition | `draft \| published \| deprecated`                                          | Yes — transitions are one-way only                 |
| `VersionSnapshot`          | WorkflowDefinition | `{ id, name, states[], transitions[{ rules[] }] }` JSONB                    | Yes — never mutated after creation                 |
| `ExpressionRuleDefinition` | WorkflowDefinition | `{ type, all?, any?, not? }` json-rules-engine AST                          | Yes — stored as-is in DB                           |
| `CustomRuleDefinition`     | WorkflowDefinition | `{ type: CUSTOM, strategy, params }`                                        | Yes — stored as-is in DB                           |
| `AllowedRoleIds`           | WorkflowDefinition | `UUID[]` — empty means unrestricted                                         | No — may be updated during draft editing           |
| `WorkflowInstanceStatus`   | WorkflowInstance   | `active \| completed \| cancelled`                                          | Yes — terminal statuses cannot be reversed         |
| `InstancePayload`          | WorkflowInstance   | `Record<string, unknown>` JSONB                                             | Yes — payload is immutable after creation          |
| `DefinitionVersionRef`     | WorkflowInstance   | `(workflowDefinitionId: UUID, definitionVersion: int)`                      | Yes — pinned at instance creation                  |
| `CurrentStateRef`          | WorkflowInstance   | `(currentStateId: UUID, currentStateName: string)`                          | No — updated on each successful transition         |
| `JwtPayload`               | User               | `{ sub, email, firstName, tenantId, tenantSlug, roles[], roleIds[], plan }` | Yes — immutable token; new token issued on refresh |
| `TokenHash`                | User               | SHA-256 of raw refresh token                                                | Yes — hash of a one-time token                     |
| `TenantPlan`               | Tenant             | `free \| pro \| enterprise`                                                 | No — updated via plan upgrade/downgrade            |
| `TenantSlug`               | Tenant             | `varchar(100)` URL-safe identifier                                          | Yes — immutable after creation                     |
| `RuleContext`              | Rule Evaluation    | `{ payload, user: {id, role, roles}, instance: {currentState, createdAt} }` | Yes — computed per transition, never persisted     |
| `RuleEvaluationResult`     | Rule Evaluation    | `{ passed: boolean, failedRules: {ruleName, reason}[] }`                    | Yes — transient computation result                 |
| `ActionType`               | AuditLog           | 12-value enum of recognised domain events                                   | Yes — append-only log entry                        |
| `ActorSnapshot`            | AuditLog           | `(actorEmail, actorRole)` strings at event time                             | Yes — snapshot, never updated                      |
| `NotificationChannel`      | NotificationConfig | `email \| webhook`                                                          | Yes — defined at template creation                 |
| `NotificationStatus`       | NotificationConfig | `pending \| sent \| failed`                                                 | No — updated as delivery progresses                |
| `WebhookSignature`         | NotificationConfig | `HMAC-SHA256(payload, secret)` — computed at delivery                       | Yes — never persisted                              |

---

## 6. Domain Events

All domain events are defined as TypeScript interfaces in `libs/shared/src/interfaces/events/` and their subject strings are enumerated in `libs/shared/src/constants/nats-events.enum.ts`. Every event includes `eventId: string` (UUID v4) and `occurredAt: string` (ISO-8601) as mandatory fields for idempotency and ordering.

| Event Name (NATS Subject)                 | Raised By                       | Consumed By                                                                                   | Payload                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.user.created`                       | `AuthPublisher` (AuthModule)    | `AuditSubscriber`, `NotificationSubscriber`, `AuthEventsSubscriber` (WorkflowExecutionModule) | `{ eventId, tenantId, userId, email, firstName, lastName, roles[], occurredAt }`                                                                                                                         |
| `auth.user.deactivated`                   | `AuthPublisher`                 | `AuditSubscriber`, `AuthEventsSubscriber`                                                     | `{ eventId, tenantId, userId, occurredAt }`                                                                                                                                                              |
| `auth.user.roles-updated`                 | `AuthPublisher`                 | `AuditSubscriber`, `AuthEventsSubscriber`                                                     | `{ eventId, tenantId, userId, roles[], occurredAt }`                                                                                                                                                     |
| `tenant.created`                          | `AuthPublisher` (at onboarding) | `AuditSubscriber`, `NotificationSubscriber`                                                   | `{ eventId, tenantId, name, slug, plan, adminUserId?, adminEmail?, adminFirstName?, adminLastName?, occurredAt }`                                                                                        |
| `tenant.deactivated`                      | `TenantPublisher`               | `AuditSubscriber`                                                                             | `{ eventId, tenantId, occurredAt }`                                                                                                                                                                      |
| `tenant.plan-updated`                     | `TenantPublisher`               | `AuditSubscriber`                                                                             | `{ eventId, tenantId, oldPlan, newPlan, occurredAt }`                                                                                                                                                    |
| `workflow-definition.published`           | `WorkflowDefinitionPublisher`   | `AuditSubscriber`                                                                             | `{ eventId, tenantId, definitionId, versionNumber, publishedByUserId, publishedByEmail, publishedByRole, occurredAt }`                                                                                   |
| `workflow-definition.deprecated`          | `WorkflowDefinitionPublisher`   | `AuditSubscriber`                                                                             | `{ eventId, tenantId, definitionId, occurredAt }`                                                                                                                                                        |
| `workflow-execution.instance.created`     | `ExecutionPublisher`            | `AuditSubscriber`, `NotificationSubscriber`                                                   | `{ eventId, tenantId, instanceId, performedByUserId, performedByEmail, performedByRole, workflowDefinitionId, initialState, createdByUserId, occurredAt }`                                               |
| `workflow-execution.transition.completed` | `ExecutionPublisher`            | `AuditSubscriber`, `NotificationSubscriber`                                                   | `{ eventId, tenantId, instanceId, workflowDefinitionId, fromState, toState, transitionId, transitionName, performedByUserId, performedByEmail, performedByRole, comment?, instancePayload, occurredAt }` |
| `workflow-execution.instance.completed`   | `ExecutionPublisher`            | `AuditSubscriber`, `NotificationSubscriber`                                                   | `{ eventId, tenantId, instanceId, performedByUserId, performedByEmail, performedByRole, comment?, workflowDefinitionId, fromState, finalState, transitionId, transitionName, occurredAt }`               |
| `workflow-execution.instance.cancelled`   | `ExecutionPublisher`            | `AuditSubscriber`, `NotificationSubscriber`                                                   | `{ eventId, tenantId, instanceId, performedByUserId, performedByEmail, workflowDefinitionId, cancelledByUserId, occurredAt }`                                                                            |

**Event publishing rules:**

- Publisher classes (`*Publisher`) live in `<module>/publishers/` and only publish — they never subscribe.
- Subscriber classes (`*Subscriber`) live in `<module>/subscribers/` and only subscribe — they never publish.
- All event subjects are string constants from `NatsEvents` enum — no magic strings anywhere in the codebase.
- Subscribers check `eventId` uniqueness before processing to ensure exactly-once semantics despite at-least-once delivery.

---

## 7. Repositories

| Repository                       | Aggregate                     | Interface Location                     | Implementation                                                                    |
| -------------------------------- | ----------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `WorkflowDefinitionRepository`   | WorkflowDefinition            | Internal to `WorkflowDefinitionModule` | `src/modules/workflow-definition/repositories/workflow-definition.repository.ts`  |
| `WorkflowStateRepository`        | WorkflowDefinition            | Internal                               | `src/modules/workflow-definition/repositories/workflow-state.repository.ts`       |
| `WorkflowTransitionRepository`   | WorkflowDefinition            | Internal                               | `src/modules/workflow-definition/repositories/workflow-transition.repository.ts`  |
| `TransitionRuleRepository`       | WorkflowDefinition            | Internal                               | `src/modules/workflow-definition/repositories/transition-rule.repository.ts`      |
| `WorkflowVersionRepository`      | WorkflowDefinition            | Internal                               | `src/modules/workflow-definition/repositories/workflow-version.repository.ts`     |
| `InstanceFormSchemaRepository`   | WorkflowDefinition            | Internal                               | `src/modules/workflow-definition/repositories/instance-form-schema.repository.ts` |
| `WorkflowInstanceRepository`     | WorkflowInstance              | Internal to `WorkflowExecutionModule`  | `src/modules/workflow-execution/repositories/workflow-instance.repository.ts`     |
| `UserShadowRepository`           | WorkflowInstance (read model) | Internal                               | `src/modules/workflow-execution/repositories/user-shadow.repository.ts`           |
| `UserRepository`                 | User                          | Internal to `AuthModule`               | `src/modules/auth/repositories/user.repository.ts`                                |
| `RefreshTokenRepository`         | User                          | Internal                               | `src/modules/auth/repositories/refresh-token.repository.ts`                       |
| `RoleRepository`                 | User                          | Internal                               | `src/modules/auth/repositories/role.repository.ts`                                |
| `TenantRepository`               | Tenant                        | Internal to `TenantModule`             | `src/modules/tenant/repositories/tenant.repository.ts`                            |
| `TenantSettingsRepository`       | Tenant                        | Internal                               | `src/modules/tenant/repositories/tenant-settings.repository.ts`                   |
| `TenantFeatureFlagRepository`    | Tenant                        | Internal                               | `src/modules/tenant/repositories/tenant-feature-flag.repository.ts`               |
| `AuditLogRepository`             | AuditLog                      | Internal to `AuditModule`              | `src/modules/audit/repositories/audit-log.repository.ts`                          |
| `NotificationTemplateRepository` | NotificationConfig            | Internal to `NotificationModule`       | `src/modules/notification/repositories/notification-template.repository.ts`       |
| `NotificationLogRepository`      | NotificationConfig            | Internal                               | `src/modules/notification/repositories/notification-log.repository.ts`            |
| `WebhookConfigRepository`        | NotificationConfig            | Internal                               | `src/modules/notification/repositories/webhook-config.repository.ts`              |
| `WebhookDeliveryLogRepository`   | NotificationConfig            | Internal                               | `src/modules/notification/repositories/webhook-delivery-log.repository.ts`        |

**External repository contracts** — the Symbol-token interfaces that cross bounded-context boundaries:

| Contract Symbol                            | Interface                                | Exposed By                                            | Purpose                                                                             |
| ------------------------------------------ | ---------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `USER_QUERY_CONTRACT`                      | `IUserQueryContract`                     | `AuthModule` via `UserQueryService`                   | Allows other modules to look up user summaries without coupling to `UserRepository` |
| `TENANT_QUERY_CONTRACT`                    | `ITenantQueryContract`                   | `TenantModule` via `TenantQueryService`               | Read-side tenant access for auth and execution modules                              |
| `TENANT_PROVISIONING_CONTRACT`             | `ITenantProvisioningContract`            | `TenantModule` via `TenantProvisioningService`        | Write-side tenant creation used during onboarding                                   |
| `WORKFLOW_QUERY_CONTRACT`                  | `IWorkflowQueryContract`                 | `WorkflowDefinitionModule` via `WorkflowQueryService` | Snapshot and form schema reads for execution module                                 |
| `WORKFLOW_EXECUTION_QUERY_CONTRACT`        | `IWorkflowExecutionQueryContract`        | `WorkflowExecutionModule` via query service           | Active instance count for dashboard                                                 |
| `RULE_ENGINE_CONTRACT`                     | `IRuleEngineContract`                    | `RuleEngineModule` via `RuleEngineService`            | Stateless rule evaluation                                                           |
| `NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT` | `INotificationTemplateBootstrapContract` | `NotificationModule`                                  | Ensure default templates exist before tenant onboarding completes                   |

---

## 8. Domain Services

Domain services encapsulate logic that spans multiple entities within a bounded context and does not naturally belong to any single aggregate root.

| Service                     | Responsibility                                                                                                                                                                                                            | Operates Across                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `WorkflowVersionService`    | Orchestrates the publication of a workflow definition: loads all states, transitions, and rules; constructs the immutable snapshot JSONB; deactivates previous versions; bumps `currentVersion`; publishes the NATS event | `WorkflowDefinition`, `WorkflowState`, `WorkflowTransition`, `TransitionRule`, `WorkflowDefinitionVersion` |
| `RuleEngineService`         | Routes each rule to the correct evaluator (expression vs custom strategy); collects all failure results; returns a structured `RuleEvaluationResult`. Stateless — no DB writes                                            | `RuleDefinition` value objects; `RuleContext`; `ConditionEvaluator`; `CustomRuleEvaluator`                 |
| `RuleContextBuilder`        | Transforms the runtime `RuleContext` into the flat fact namespace structure expected by `json-rules-engine` (`{ payload, user, instance }`)                                                                               | `RuleContext` value object                                                                                 |
| `ConditionEvaluator`        | Wraps `json-rules-engine`; creates a fresh `Engine` per call (intentionally, to avoid shared state across concurrent requests); executes expression rules and maps failure results                                        | `ExpressionRuleDefinition` value objects                                                                   |
| `CustomRuleEvaluator`       | Implements custom rule strategies (`date-range-matches-days`, `user-has-any-role`) that cannot be expressed as JSON AST conditions                                                                                        | `CustomRuleDefinition` value objects; `RuleContext`                                                        |
| `AuthService`               | Authenticates users (Argon2 verify), builds JWT payload from user + tenant state, issues and rotates refresh tokens                                                                                                       | `User`, `RefreshToken`, `Tenant` (via contract)                                                            |
| `TenantProvisioningService` | Creates a new `Tenant` + bootstraps `TenantSettings` atomically; validates slug uniqueness                                                                                                                                | `Tenant`, `TenantSettings`                                                                                 |

---

## 9. Application Services

Application services orchestrate use cases. In this NestJS codebase, application services are either traditional `@Injectable()` service classes or CQRS command/query handlers. They coordinate domain objects, repositories, and domain services without containing domain logic themselves.

| Service / Handler                                | Module             | Orchestrates                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateInstanceHandler` (`@CommandHandler`)      | WorkflowExecution  | Validates definition status via contract; validates payload against form schema; resolves initial state from snapshot; creates and persists `WorkflowInstance`; publishes `instance.created` event                                                       |
| `ExecuteTransitionHandler` (`@CommandHandler`)   | WorkflowExecution  | Full 11-step transition pipeline: idempotency lock → load instance → validate status/version → load snapshot → find transition → check roles → check comment → evaluate rules → atomic UPDATE with optimistic lock → cache invalidation → publish events |
| `CancelInstanceHandler` (`@CommandHandler`)      | WorkflowExecution  | Validates instance is ACTIVE; marks `status = CANCELLED`; publishes `instance.cancelled` event                                                                                                                                                           |
| `GetInstanceDetailHandler` (`@QueryHandler`)     | WorkflowExecution  | Loads instance + allowed transitions; assembles display DTO with user shadow data                                                                                                                                                                        |
| `GetInstanceListHandler` (`@QueryHandler`)       | WorkflowExecution  | Paginated instance list with status and definition filters; cache-aside                                                                                                                                                                                  |
| `GetAllowedTransitionsHandler` (`@QueryHandler`) | WorkflowExecution  | Loads snapshot; filters transitions by `currentStateId` and actor `roleIds`; cache-aside                                                                                                                                                                 |
| `WorkflowDefinitionService`                      | WorkflowDefinition | CRUD for definitions; delegates publish to `WorkflowVersionService`; manages cache invalidation                                                                                                                                                          |
| `WorkflowStateService`                           | WorkflowDefinition | CRUD for states within a definition                                                                                                                                                                                                                      |
| `WorkflowTransitionService`                      | WorkflowDefinition | CRUD for transitions; rule attachment                                                                                                                                                                                                                    |
| `UserService`                                    | Auth               | User CRUD, role assignment, password change                                                                                                                                                                                                              |
| `TenantService`                                  | Tenant             | Tenant detail update, settings update, plan change, deactivation                                                                                                                                                                                         |
| `AuditService`                                   | Audit              | Paginated read of `audit_logs` for a workflow instance                                                                                                                                                                                                   |
| `NotificationService`                            | Notification       | Resolves templates for a trigger event; renders Pug; dispatches email via `@nestjs-modules/mailer`; records in `notification_logs`                                                                                                                       |
| `WebhookService`                                 | Notification       | Signs payload with HMAC-SHA256; delivers HTTP POST; records in `webhook_delivery_logs`                                                                                                                                                                   |
| `DashboardService`                               | Dashboard          | Aggregates counts from definition and execution repositories for tenant dashboard stats                                                                                                                                                                  |

---

## 10. Factories

Factories encapsulate complex object construction logic that would otherwise pollute aggregate roots or application services.

| Factory                                               | Creates                                                                                                                | Location                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `WorkflowVersionService.publish()`                    | `WorkflowDefinitionVersion` with fully assembled `snapshot` JSONB                                                      | `src/modules/workflow-definition/services/workflow-version.service.ts`         |
| `CreateInstanceHandler.execute()`                     | `WorkflowInstance` pre-populated with `initialState`, `definitionVersion`, `payload`, `status = ACTIVE`, `version = 1` | `src/modules/workflow-execution/handlers/create-instance.handler.ts`           |
| `AuthService.issueTokenPair()`                        | JWT access token + opaque refresh token + `RefreshToken` entity                                                        | `src/modules/auth/services/auth.service.ts`                                    |
| `TenantProvisioningService.provision()`               | `Tenant` entity + `TenantSettings` entity (bootstrapped with safe defaults)                                            | `src/modules/tenant/services/tenant-provisioning.service.ts`                   |
| `NotificationTemplateBootstrapService.onModuleInit()` | Five default `NotificationTemplate` records per tenant                                                                 | `src/modules/notification/services/notification-template-bootstrap.service.ts` |
| `RuleContextBuilder.build()`                          | `Record<string, unknown>` fact map structured as `{ payload, user, instance }`                                         | `src/modules/rule-engine/evaluators/rule-context.builder.ts`                   |

---

## 11. Ubiquitous Language Glossary

The following terms have precise, agreed-upon meanings within this codebase. Engineers, product managers, and domain experts must use these terms consistently to avoid model confusion.

| Term                             | Definition                                                                                                                                                                                                                                                                                        | Context                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Tenant**                       | A company or organisation that subscribes to the platform. All data — users, workflow definitions, instances — is owned by and isolated within a tenant.                                                                                                                                          | All contexts                        |
| **Tenant Slug**                  | A URL-friendly, globally unique, immutable short identifier for a tenant (e.g., `acme-corp`). Used for human-readable tenant resolution during self-registration.                                                                                                                                 | Tenancy, Identity                   |
| **Tenant Plan**                  | The subscription tier of a tenant: `free`, `pro`, or `enterprise`. Governs feature access and limits (max users, max definitions). Embedded in the JWT at login.                                                                                                                                  | Tenancy, Identity                   |
| **Workflow Definition**          | A reusable template that describes a business process as a finite state machine — its states, the transitions between them, and the rules that guard those transitions. Belongs to exactly one tenant.                                                                                            | Workflow Design                     |
| **Workflow State**               | A named node in a workflow definition's state graph. Every definition has exactly one initial state and zero or more terminal states.                                                                                                                                                             | Workflow Design                     |
| **Initial State**                | The state in which every new workflow instance begins. Exactly one state per definition may have `isInitial = true`.                                                                                                                                                                              | Workflow Design                     |
| **Terminal State**               | A state that marks the end of a workflow instance's lifecycle. Any transition reaching a terminal state automatically marks the instance as `COMPLETED`. A definition may have multiple terminal states (e.g., `Approved` and `Rejected`).                                                        | Workflow Design                     |
| **Transition**                   | A directed edge in the state graph from a `fromState` to a `toState`. Carries: allowed role constraints (`allowedRoleIds`), a comment requirement flag (`requiresComment`), and zero or more business rules.                                                                                      | Workflow Design                     |
| **Transition Rule**              | A business logic guard on a transition, stored as a JSON AST (`ruleDefinition` JSONB). Evaluated against the instance payload and actor context before the transition is applied. All rules on a transition must pass.                                                                            | Workflow Design                     |
| **Rule Definition**              | The JSONB structure describing a rule. Either an `ExpressionRuleDefinition` (json-rules-engine AST with `all`/`any`/`not` operators) or a `CustomRuleDefinition` (a named strategy with typed parameters).                                                                                        | Workflow Design, Rule Evaluation    |
| **Version**                      | A numbered, immutable snapshot of a workflow definition at a specific point in time. Version numbers are monotonically increasing integers. Once created, a version is never modified.                                                                                                            | Workflow Design                     |
| **Version Snapshot**             | The complete denormalised JSONB representation of a workflow definition at the moment of publication: all states, transitions, rules, and their relationships. Stored in `workflow_definition_versions.snapshot`.                                                                                 | Workflow Design, Workflow Execution |
| **Publish**                      | The act of creating an immutable version snapshot from a draft definition and making it available for instance creation. Publishing transitions the definition from `DRAFT` to `PUBLISHED`.                                                                                                       | Workflow Design                     |
| **Deprecate**                    | The act of marking a published workflow definition as `DEPRECATED`. New instances cannot be created from a deprecated definition. Existing running instances are unaffected.                                                                                                                      | Workflow Design                     |
| **Workflow Instance**            | A single execution of a workflow definition for a specific business request (e.g., a leave application, a purchase approval). Created from a published definition; pinned to a specific version snapshot.                                                                                         | Workflow Execution                  |
| **Instance Payload**             | The dynamic business data attached to a workflow instance at creation time (e.g., `{ requestedDays: 10, leaveType: "Annual" }`). Stored as JSONB. Immutable after creation. Used as a fact namespace in rule evaluation.                                                                          | Workflow Execution                  |
| **Instance Form Schema**         | The set of expected fields and their types for an instance's payload, accumulated from rule definitions. Used to validate the payload at instance creation time.                                                                                                                                  | Workflow Execution, Workflow Design |
| **Execute Transition**           | The act of moving a workflow instance from its current state to another state via a named transition. Subject to role checks, comment requirements, and rule evaluation. Guarded by optimistic locking.                                                                                           | Workflow Execution                  |
| **Optimistic Locking**           | A concurrency control mechanism that prevents two simultaneous transition attempts from both succeeding. The `version` integer on `WorkflowInstance` is checked and incremented atomically. A mismatch returns `409 TRANSITION_CONFLICT`.                                                         | Workflow Execution                  |
| **Allowed Transitions**          | The set of transitions available to a specific actor on a specific instance in its current state, filtered by the actor's role IDs against `allowedRoleIds`.                                                                                                                                      | Workflow Execution                  |
| **Actor**                        | The authenticated user performing an action on a workflow instance. Their identity (`sub`, `email`, `roles`, `roleIds`, `tenantId`) is read exclusively from the JWT payload — zero additional DB calls.                                                                                          | Workflow Execution                  |
| **Rule Context**                 | The structured fact object assembled at transition time and passed to the rule engine. Has three namespaces: `payload` (instance data), `user` (actor identity from JWT), `instance` (current state name, creation timestamp).                                                                    | Rule Evaluation                     |
| **Fact Namespace**               | One of the three top-level keys in the rule context: `payload`, `user`, or `instance`. Rule authors reference facts using JSONPath notation within a namespace (e.g., `{ fact: "payload", path: "$.requestedDays" }`).                                                                            | Rule Evaluation                     |
| **Expression Rule**              | A rule whose logic is fully captured in a json-rules-engine condition AST (`all`, `any`, `not`, `operator`, `value`). No custom code required.                                                                                                                                                    | Rule Evaluation                     |
| **Custom Rule**                  | A rule whose logic is implemented as a named strategy in `CustomRuleEvaluator` (e.g., `date-range-matches-days`, `user-has-any-role`). Used for logic that cannot be expressed as a simple JSON AST.                                                                                              | Rule Evaluation                     |
| **Shadow Read Model**            | A local copy of data owned by another bounded context, maintained inside the consuming module's database and kept in sync via NATS events. `we_user_shadows` is the execution module's shadow of the identity module's users.                                                                     | Workflow Execution, Identity        |
| **Contract Interface**           | A TypeScript interface paired with a Symbol token that defines the public API between two bounded contexts. The consuming module injects the Symbol token and depends only on the interface — never on the implementing class. Swap the class for a gRPC client on microservice extraction.       | All contexts                        |
| **Tenant Isolation Guard**       | The NestJS guard (`TenantIsolationGuard`) that verifies `req.user.tenantId` is present on every authenticated request. Prevents the possibility of a request reaching a controller without a valid tenant context.                                                                                | All contexts                        |
| **Row-Level Security (RLS)**     | A PostgreSQL feature that automatically appends `AND tenant_id = current_setting('app.tenant_id')::uuid` to every query on tenant-scoped tables. Provides database-level tenant isolation independent of application code.                                                                        | Database                            |
| **Audit Log**                    | An immutable, append-only record of a domain event. Written asynchronously by the `AuditSubscriber` in response to NATS events. Protected by a PostgreSQL trigger that blocks `UPDATE` and `DELETE`.                                                                                              | Audit                               |
| **Idempotency Key**              | A client-supplied UUID that uniquely identifies a specific transition request. If the same key is presented twice within the TTL window, the second call receives the cached result of the first — preventing duplicate transitions on network retries.                                           | Workflow Execution                  |
| **Leaky Bucket**                 | The rate-limiting algorithm used by `EnhancedRateLimitMiddleware`. Tokens are consumed on each request and replenished at a constant rate. Burst capacity allows short spikes; the leak rate enforces sustained throughput limits.                                                                | Infrastructure                      |
| **Noisy Neighbour**              | The problem in multi-tenant systems where one tenant's excessive API usage degrades performance for all others. Solved by per-tenant isolated leaky-bucket rate limiting.                                                                                                                         | Infrastructure                      |
| **Definition Version Reference** | The pair `(workflowDefinitionId, definitionVersion)` stored on a `WorkflowInstance`. Uniquely identifies the snapshot from which the instance was created and against which all transitions are evaluated.                                                                                        | Workflow Execution                  |
| **CQRS**                         | Command Query Responsibility Segregation. Used within `WorkflowExecutionModule` to separate state-changing operations (`CreateInstanceCommand`, `ExecuteTransitionCommand`, `CancelInstanceCommand`) from reads (`GetInstanceDetailQuery`, `GetInstanceListQuery`, `GetAllowedTransitionsQuery`). | Workflow Execution                  |

---

_Document 04 of 13 — Domain Model / DDD Design_  
_Cross-reference: `02-HIGH-LEVEL-DESIGN.md` for context interaction flows, `03-LOW-LEVEL-DESIGN.md` for class-level implementation details, `05-DATABASE-DESIGN.md` for entity-to-table mapping, `07-SECURITY-DESIGN.md` for the security implications of the multi-tenancy model_
