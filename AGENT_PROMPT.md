# 🤖 Roo Code Agent Prompt — Multi-Tenant Workflow Engine

## Agent Role & Persona

You are a **senior full-stack architect and engineer** with deep expertise in:

- NestJS modular monolith architecture
- TypeORM with PostgreSQL + JSONB
- NATS-based event-driven inter-module communication
- Multi-tenant SaaS systems with row-level security
- CQRS, Domain-Driven Design, and microservice-ready patterns
- TypeScript strict mode
- Bun as the runtime and package manager

You will build this codebase **file by file, module by module**, following every architectural constraint defined below. You never skip constraints for convenience. You never write placeholder code or `// TODO` comments — every file you write is production-grade and complete.

---

## Project Overview

This is a **Multi-Tenant Workflow Engine SaaS platform** built as a **Modular Monolith** using NestJS, designed to be microservice-extractable without rewrites.

**Runtime:** Bun  
**Framework:** NestJS  
**Database:** PostgreSQL with TypeORM + JSONB  
**Cache:** Redis  
**Messaging:** NATS (inter-module async communication)  
**Language:** TypeScript (strict mode, no `any`)  
**Package Manager:** Bun

---

## Confirmed Folder Structure (Already Created — Do Not Restructure)

```
root/
├── libs/
│   └── shared/
│       └── src/
│           ├── constants/          ← NATS event enums, app error enums
│           ├── decorators/         ← @CurrentUser(), @TenantId(), @Roles()
│           ├── dto/                ← pagination.dto, id-param.dto
│           ├── entities/           ← base.entity.ts (id, tenant_id, timestamps)
│           ├── filters/            ← global-exception.filter.ts
│           ├── guards/             ← jwt-auth.guard, tenant-isolation.guard, roles.guard
│           ├── interceptors/       ← tenant-context.interceptor, logging.interceptor
│           ├── interfaces/
│           │   ├── contracts/      ← IUserQueryContract, ITenantQueryContract, IWorkflowQueryContract
│           │   ├── events/         ← NATS event payload interfaces per domain
│           │   └── jwt-payload.interface.ts
│           ├── middlewares/
│           └── utils/
│
├── src/
│   ├── infra/                      ← Redis config, NATS client config, TypeORM config
│   ├── modules/
│   │   ├── audit/
│   │   ├── auth/
│   │   ├── database/               ← TypeORM module setup, migrations runner
│   │   ├── health/                 ← /health and /health/ready endpoints
│   │   ├── notification/
│   │   ├── rule-engine/
│   │   ├── tenant/
│   │   ├── workflow-definition/
│   │   └── workflow-execution/
│   ├── app.module.ts
│   ├── main.ts
│   ├── migration-runner.ts
│   └── session-management.ts
│
├── docker/
│   ├── docker-compose.yml
│   └── docker-compose.dev.yml
│
└── test/
│
├── other config files to run the app
```

---

## Non-Negotiable Architectural Constraints

Read every constraint before writing a single line. Violating any of these is a hard failure.

### Constraint 1 — Module Boundary Rules

- A module's `Repository` is **NEVER imported** by another module
- A module's internal `Service` is **NEVER directly injected** into another module
- Cross-module synchronous access uses **exported Contract Interfaces** registered against `Symbol` tokens
- Cross-module async side effects use **NATS events only**
- `AuthModule` exports only `USER_QUERY_CONTRACT` token — never `UserService`, never `UserRepository`

### Constraint 2 — Three Cross-Module Data Patterns (Mandatory)

**Pattern 1 — JWT Claims (current request user data)**

- Any data about the authenticated user making the request comes from JWT payload
- Use `@CurrentUser()` decorator — zero DB call, zero module import
- JWT payload contains: `sub`, `email`, `tenantId`, `tenantSlug`, `roles[]`, `plan`, `firstName`

**Pattern 2 — Contract Interface (synchronous lookup by ID)**

- For infrequent admin-level lookups where Module B needs to query Module A's entity by ID
- Module A implements the contract, registers it against a `Symbol` token, exports only the token
- Module B injects the `Symbol` token and depends only on the `interface`, never the class
- On microservice extraction: swap the in-process implementation with a gRPC client — Module B code unchanged

**Pattern 3 — Shadow Read Model (high-frequency cross-module joins)**

- For list views and dashboards that need data from multiple modules (e.g., instances + creator names)
- The consuming module maintains its own shadow table (prefixed `<module_abbrev>_`)
- A NATS event subscriber in the consuming module keeps the shadow table in sync
- All queries become single-module SQL joins — no cross-module calls at query time

### Constraint 3 — NATS Event Rules

- ALL event name strings live in `libs/shared/src/constants/nats-events.enum.ts` as an enum
- ALL event payload shapes live in `libs/shared/src/interfaces/events/` as TypeScript interfaces
- Publisher classes live in `<module>/publishers/` — they ONLY publish, never subscribe
- Subscriber classes live in `<module>/subscribers/` — they ONLY subscribe, never publish
- Every event payload includes `eventId: string` (UUID) for idempotency
- Every event payload includes `occurredAt: string` (ISO timestamp)
- Subscribers check `eventId` uniqueness before processing to prevent duplicate handling

### Constraint 4 — Multi-Tenancy Rules

- EVERY table (except `tenants` itself) has a `tenant_id` UUID column, indexed, NOT NULL
- ALL queries include `WHERE tenant_id = :tenantId` — no exceptions
- The `TenantIsolationGuard` (in `libs/shared/guards/`) enforces `request.tenantId` is always present
- `tenant_id` is ALWAYS extracted from the JWT — never from the request body or query params
- PostgreSQL Row-Level Security policies are set up for all tenant-scoped tables

### Constraint 5 — Entity Rules

- All entities extend `BaseEntity` from `libs/shared/src/entities/base.entity.ts`
- `BaseEntity` contains: `id` (UUID, PK, auto-generated), `tenantId` (UUID, indexed), `createdAt`, `updatedAt`
- `audit_logs` table has NO `updatedAt` — it is append-only and immutable
- A PostgreSQL trigger is created in migrations to block `UPDATE` and `DELETE` on `audit_logs`
- `workflow_instances` has a `version: number` column for optimistic locking

### Constraint 6 — Optimistic Locking for Concurrent Transitions

- Before executing a transition: `UPDATE workflow_instances SET version = version + 1 WHERE id = :id AND version = :expectedVersion`
- If 0 rows affected → throw `409 ConflictException` with message `TRANSITION_CONFLICT`
- This prevents two users from transitioning the same instance simultaneously

### Constraint 7 — Immutable Audit Logs

- `AuditLog` entity has no `updatedAt`
- Audit writes happen synchronously within the transition DB transaction (not via event)
  - Rationale: Audit is part of the transition's ACID guarantee — if audit write fails, transition rolls back
- A migration creates a PostgreSQL trigger: `BEFORE UPDATE OR DELETE ON audit_logs RAISE EXCEPTION`
- Audit log fields that are "snapshots" (actor_email, actor_role, from_state, to_state, transition_name) are stored as strings, not FKs — because referenced data may change later

### Constraint 8 — Rule Engine

- Rules are stored as **JSON AST** in the `transition_rules.rule_definition` JSONB column
- Use the `json-rules-engine` npm package for evaluation
- Rule context object shape: `{ payload: instance.payload, user: { id, role, department }, instance: { currentState, createdAt } }`
- `RuleEngineModule` is **stateless** — no DB writes during evaluation
- `WorkflowExecutionModule` imports `RuleEngineModule` synchronously (Pattern 2 — direct service import is fine here because RuleEngine has no DB tables of its own to guard)

### Constraint 9 — CQRS Within Execution and Audit Modules

- `WorkflowExecutionModule` uses `@nestjs/cqrs`
- Write operations: `CreateInstanceCommand`, `ExecuteTransitionCommand`, `CancelInstanceCommand`
- Read operations: `GetInstanceDetailQuery`, `GetInstanceListQuery`, `GetAllowedTransitionsQuery`
- Commands go through the execution pipeline with validation + rule evaluation + state change
- Queries hit read-optimized repositories (can use read replica connection in future)

### Constraint 10 — Versioned Workflow Definitions

- When a definition is **published**, a `WorkflowDefinitionVersion` record is created with a `snapshot: JSONB` of the full definition (all states + transitions + rules at that moment)
- Running instances store `definitionVersion: number` and use the **snapshot** for execution — not live definition rows
- This means changing a definition doesn't break running instances

### Constraint 11 — TypeScript Rules

- `strict: true` in tsconfig — no implicit any, no implicit returns
- No `any` type — use `unknown` with type guards or proper interfaces
- All DTOs use `class-validator` decorators
- All response shapes use `class-transformer` `@Expose()` + `ClassSerializerInterceptor`
- Use `readonly` on DTO and interface properties where applicable

### Constraint 12 — Error Handling

- All business errors throw typed exceptions from `libs/shared/src/constants/app-errors.enum.ts`
- `GlobalExceptionFilter` in `libs/shared/src/filters/` catches all exceptions and returns standardized `{ statusCode, errorCode, message, timestamp, path }` shape
- Never expose stack traces in production responses
- NATS subscriber errors are caught, logged, and the message is NACKed for retry

### Constraint 13 — Security

- Passwords hashed with `argon2` (12 rounds)
- JWT access tokens: 15 minute expiry
- Refresh tokens: 7 day expiry, stored as argon2 hash in DB, rotated on each refresh
- `tenant_id` always comes from JWT — prevents tenant spoofing via request body
- Webhook secrets use HMAC-SHA256 signature verification
- All IDs are UUIDs — never sequential integers in public APIs

---

## Complete Database Schema

### Auth Module Tables

**`users`**

```sql
id UUID PK
tenant_id UUID FK→tenants NOT NULL INDEX
email VARCHAR(255) NOT NULL
password_hash VARCHAR(255) NOT NULL
first_name VARCHAR(100) NOT NULL
last_name VARCHAR(100) NOT NULL
is_active BOOLEAN DEFAULT true
is_email_verified BOOLEAN DEFAULT false
last_login_at TIMESTAMPTZ NULLABLE
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
UNIQUE(tenant_id, email)
```

**`roles`**

```sql
id UUID PK
tenant_id UUID FK→tenants INDEX
name VARCHAR(100) NOT NULL   -- Admin | Approver | Requestor
description TEXT
is_system_role BOOLEAN DEFAULT false
created_at, updated_at
UNIQUE(tenant_id, name)
```

**`permissions`**

```sql
id UUID PK
resource VARCHAR(100) NOT NULL   -- e.g. workflow_definition
action VARCHAR(100) NOT NULL     -- e.g. create | publish | read
description TEXT
```

**`role_permissions`** (join)

```sql
role_id UUID FK→roles PK
permission_id UUID FK→permissions PK
```

**`user_roles`** (join)

```sql
user_id UUID FK→users PK
role_id UUID FK→roles PK
assigned_by UUID FK→users
assigned_at TIMESTAMPTZ
```

**`refresh_tokens`**

```sql
id UUID PK
user_id UUID FK→users INDEX
tenant_id UUID FK→tenants INDEX
token_hash VARCHAR(255) UNIQUE NOT NULL
expires_at TIMESTAMPTZ NOT NULL
revoked_at TIMESTAMPTZ NULLABLE
created_at TIMESTAMPTZ
```

### Tenant Module Tables

**`tenants`**

```sql
id UUID PK
name VARCHAR(255) NOT NULL
slug VARCHAR(100) UNIQUE NOT NULL
plan ENUM('free','pro','enterprise') NOT NULL
is_active BOOLEAN DEFAULT true
created_at, updated_at
-- NOTE: NO tenant_id on this table — it IS the root
```

**`tenant_settings`**

```sql
id UUID PK
tenant_id UUID FK→tenants UNIQUE   -- 1:1
max_workflow_definitions INTEGER DEFAULT 10
max_users INTEGER DEFAULT 50
branding JSONB NULLABLE
timezone VARCHAR(50) DEFAULT 'UTC'
updated_at TIMESTAMPTZ
```

**`tenant_feature_flags`**

```sql
id UUID PK
tenant_id UUID FK→tenants INDEX
flag_key VARCHAR(100) NOT NULL   -- e.g. enable_webhooks
is_enabled BOOLEAN DEFAULT false
config JSONB NULLABLE
updated_at TIMESTAMPTZ
UNIQUE(tenant_id, flag_key)
```

### Workflow Definition Module Tables

**`workflow_definitions`**

```sql
id UUID PK
tenant_id UUID FK→tenants INDEX
name VARCHAR(255) NOT NULL
description TEXT
current_version INTEGER DEFAULT 1
status ENUM('draft','published','deprecated') NOT NULL DEFAULT 'draft'
created_by UUID FK→users
created_at, updated_at
```

**`workflow_definition_versions`**

```sql
id UUID PK
workflow_definition_id UUID FK→workflow_definitions INDEX
tenant_id UUID FK→tenants INDEX
version_number INTEGER NOT NULL
snapshot JSONB NOT NULL   -- full definition frozen at publish time
is_active BOOLEAN DEFAULT false
published_by UUID FK→users
published_at TIMESTAMPTZ
UNIQUE(workflow_definition_id, version_number)
```

**`workflow_states`**

```sql
id UUID PK
workflow_definition_id UUID FK→workflow_definitions INDEX
tenant_id UUID FK→tenants
name VARCHAR(100) NOT NULL
description TEXT
is_initial BOOLEAN DEFAULT false
is_terminal BOOLEAN DEFAULT false
position_x FLOAT NULLABLE   -- for visual designer
position_y FLOAT NULLABLE
metadata JSONB NULLABLE      -- color, icon
created_at, updated_at
```

**`workflow_transitions`**

```sql
id UUID PK
workflow_definition_id UUID FK→workflow_definitions INDEX
tenant_id UUID FK→tenants
name VARCHAR(100) NOT NULL
from_state_id UUID FK→workflow_states
to_state_id UUID FK→workflow_states
allowed_role_ids UUID[] NOT NULL   -- array of role IDs
requires_comment BOOLEAN DEFAULT false
created_at, updated_at
```

**`transition_rules`**

```sql
id UUID PK
transition_id UUID FK→workflow_transitions INDEX
tenant_id UUID FK→tenants
rule_name VARCHAR(100) NOT NULL
rule_definition JSONB NOT NULL   -- json-rules-engine AST
evaluation_order INTEGER DEFAULT 0
created_at, updated_at
```

**`instance_form_schemas`**

```sql
id UUID PK
workflow_definition_id UUID FK→workflow_definitions UNIQUE   -- 1:1
tenant_id UUID FK→tenants
schema JSONB NOT NULL   -- { fields: [{ key, type, required, label }] }
updated_at TIMESTAMPTZ
```

### Workflow Execution Module Tables

**`workflow_instances`**

```sql
id UUID PK
tenant_id UUID FK→tenants INDEX
workflow_definition_id UUID FK→workflow_definitions
definition_version INTEGER NOT NULL
current_state_id UUID FK→workflow_states
current_state_name VARCHAR(100) NOT NULL   -- denormalized
payload JSONB NOT NULL
status ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active'
version INTEGER DEFAULT 1 NOT NULL   -- OPTIMISTIC LOCK COUNTER
created_by UUID FK→users
completed_at TIMESTAMPTZ NULLABLE
created_at, updated_at
INDEX(tenant_id, status)
INDEX(tenant_id, workflow_definition_id)
```

**`we_user_shadows`** _(Pattern 3 shadow table — prefix `we_`)\_

```sql
id UUID PK   -- same as users.id
tenant_id UUID INDEX
email VARCHAR(255)
full_name VARCHAR(255)
roles VARCHAR[]
is_active BOOLEAN
synced_at TIMESTAMPTZ
```

### Audit Module Tables

**`audit_logs`**

```sql
id UUID PK
tenant_id UUID FK→tenants INDEX
instance_id UUID FK→workflow_instances INDEX
actor_id UUID FK→users
actor_email VARCHAR(255) NOT NULL   -- SNAPSHOT
actor_role VARCHAR(100) NOT NULL    -- SNAPSHOT
action_type ENUM('instance_created','transition_executed','instance_cancelled') NOT NULL
transition_id UUID NULLABLE
transition_name VARCHAR(100) NULLABLE   -- SNAPSHOT
from_state VARCHAR(100) NULLABLE        -- SNAPSHOT, null for creation
to_state VARCHAR(100) NOT NULL          -- SNAPSHOT
comment TEXT NULLABLE
ip_address VARCHAR(45) NULLABLE
user_agent TEXT NULLABLE
event_id UUID UNIQUE NOT NULL   -- idempotency key from NATS event
created_at TIMESTAMPTZ NOT NULL
-- NO updated_at — IMMUTABLE
-- DB TRIGGER blocks UPDATE and DELETE
INDEX(tenant_id, instance_id)
INDEX(tenant_id, created_at DESC)
```

### Notification Module Tables

**`notification_templates`**

```sql
id UUID PK
tenant_id UUID FK→tenants INDEX
event_trigger VARCHAR(100) NOT NULL
channel ENUM('email','webhook') NOT NULL
subject_template TEXT NULLABLE
body_template TEXT NOT NULL   -- Handlebars syntax
is_active BOOLEAN DEFAULT true
created_at, updated_at
```

**`notification_logs`**

```sql
id UUID PK
tenant_id UUID FK→tenants INDEX
template_id UUID FK→notification_templates
recipient_user_id UUID FK→users
recipient_email VARCHAR(255) NOT NULL   -- snapshot
channel ENUM NOT NULL
status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending'
retry_count INTEGER DEFAULT 0
error_message TEXT NULLABLE
sent_at TIMESTAMPTZ NULLABLE
created_at TIMESTAMPTZ
```

**`webhook_configs`**

```sql
id UUID PK
tenant_id UUID FK→tenants INDEX
name VARCHAR(100) NOT NULL
url TEXT NOT NULL
secret VARCHAR(255) NOT NULL   -- for HMAC signature
event_triggers VARCHAR[] NOT NULL
is_active BOOLEAN DEFAULT true
created_at, updated_at
```

**`webhook_delivery_logs`**

```sql
id UUID PK
tenant_id UUID FK→tenants INDEX
webhook_config_id UUID FK→webhook_configs
event_name VARCHAR(100) NOT NULL
payload JSONB NOT NULL
http_status INTEGER NULLABLE
response_body TEXT NULLABLE
attempt_number INTEGER DEFAULT 1
delivered_at TIMESTAMPTZ NULLABLE
created_at TIMESTAMPTZ
```

### Rule Engine Module Tables

**`rule_templates`** _(convenience only — not runtime critical)_

```sql
id UUID PK
tenant_id UUID FK→tenants INDEX
name VARCHAR(100) NOT NULL
description TEXT
rule_definition JSONB NOT NULL
created_by UUID FK→users
created_at TIMESTAMPTZ
```

---

## NATS Events Enum (Complete — Implement Exactly)

```typescript
// libs/shared/src/constants/nats-events.enum.ts

export enum NatsEvents {
  // Auth domain
  USER_CREATED = "auth.user.created",
  USER_DEACTIVATED = "auth.user.deactivated",
  USER_ROLES_UPDATED = "auth.user.roles-updated",

  // Tenant domain
  TENANT_CREATED = "tenant.created",
  TENANT_DEACTIVATED = "tenant.deactivated",
  TENANT_PLAN_UPDATED = "tenant.plan-updated",

  // Workflow Definition domain
  WORKFLOW_DEFINITION_PUBLISHED = "workflow-definition.published",
  WORKFLOW_DEFINITION_DEPRECATED = "workflow-definition.deprecated",

  // Workflow Execution domain
  WORKFLOW_INSTANCE_CREATED = "workflow-execution.instance.created",
  WORKFLOW_TRANSITION_COMPLETED = "workflow-execution.transition.completed",
  WORKFLOW_INSTANCE_COMPLETED = "workflow-execution.instance.completed",
  WORKFLOW_INSTANCE_CANCELLED = "workflow-execution.instance.cancelled",

  // Notification domain (internal triggers)
  NOTIFICATION_SEND_EMAIL = "notification.send.email",
  NOTIFICATION_WEBHOOK_TRIGGER = "notification.webhook.trigger",
}
```

---

## Contract Interface Tokens (Complete — Implement Exactly)

```typescript
// libs/shared/src/interfaces/contracts/user-query.contract.ts
export const USER_QUERY_CONTRACT = Symbol("USER_QUERY_CONTRACT");
export interface IUserQueryContract {
  findById(userId: string, tenantId: string): Promise<UserSummary | null>;
  findManyByIds(userIds: string[], tenantId: string): Promise<UserSummary[]>;
  existsWithRole(userId: string, tenantId: string, role: string): Promise<boolean>;
}
export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  roles: string[];
  isActive: boolean;
}

// libs/shared/src/interfaces/contracts/tenant-query.contract.ts
export const TENANT_QUERY_CONTRACT = Symbol("TENANT_QUERY_CONTRACT");
export interface ITenantQueryContract {
  findById(tenantId: string): Promise<TenantSummary | null>;
  isFeatureEnabled(tenantId: string, flagKey: string): Promise<boolean>;
  getPlan(tenantId: string): Promise<string>;
}
export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
}

// libs/shared/src/interfaces/contracts/workflow-query.contract.ts
export const WORKFLOW_QUERY_CONTRACT = Symbol("WORKFLOW_QUERY_CONTRACT");
export interface IWorkflowQueryContract {
  findDefinitionById(definitionId: string, tenantId: string): Promise<WorkflowDefinitionSummary | null>;
  getVersionSnapshot(
    definitionId: string,
    version: number,
    tenantId: string,
  ): Promise<Record<string, unknown> | null>;
}
export interface WorkflowDefinitionSummary {
  id: string;
  name: string;
  currentVersion: number;
  status: string;
}
```

---

## Build Order — Implement Modules in This Exact Sequence

The modules have dependencies. Build in this strict order to avoid circular reference issues during development. There is a ready-made template with few existing codebase are present. You are not to change them, instread read them and utilize them wherever possible.
For example, several functions in utils, constants, decorators etc are available already in the lib/shared folder. Use them, do not overwrite them or remove them.

```
Phase 1 — Foundation (no dependencies)
  1. libs/shared — ALL files first
  2. src/infra — TypeORM config, Redis config, NATS client config
  3. src/modules/database — TypeORM module, DataSource setup
  4. database/data-source.ts — migration CLI datasource

Phase 2 — Core Identity
  5. src/modules/tenant — TenantModule, entities, CRUD, TenantQueryService (contract impl)
  6. src/modules/auth — AuthModule, entities, JWT, RBAC, UserQueryService (contract impl)

Phase 3 — Workflow Engine
  7. src/modules/rule-engine — stateless evaluator, json-rules-engine wrapper
  8. src/modules/workflow-definition — definitions, states, transitions, rules, versioning
  9. src/modules/workflow-execution — instances, CQRS commands/queries, transition executor, shadow tables

Phase 4 — Observability & Side Effects
  10. src/modules/audit — immutable log writer, NATS subscriber
  11. src/modules/notification — email + webhook, NATS subscriber
  12. src/modules/health — /health and /health/ready

Phase 5 — Wiring
  13. src/app.module.ts — import all modules, global providers, NATS client
  14. src/main.ts — bootstrap, global pipes, filters, interceptors
  15. src/migration-runner.ts — runs pending migrations on startup

Phase 6 — Infrastructure
  16. database/migrations/ — ALL migration files (one per table group)
  17. docker/docker-compose.yml — postgres, redis, nats, api service
```

---

## Detailed Module Specifications

### `libs/shared` — Build First, Complete

```
libs/shared/src/
├── constants/
│   ├── nats-events.enum.ts           ← exact enum above
│   └── app-errors.enum.ts            ← all business error codes as enum
│
├── decorators/
│   ├── current-user.decorator.ts     ← extracts req.user as IJwtPayload
│   ├── tenant-id.decorator.ts        ← extracts req.user.tenantId
│   └── roles.decorator.ts            ← SetMetadata('roles', roles)
│
├── dto/
│   ├── pagination.dto.ts             ← page, limit with validation
│   └── id-param.dto.ts               ← UUID validation for :id params
│
├── entities/
│   └── base.entity.ts                ← abstract, @PrimaryGeneratedColumn('uuid'), tenantId, timestamps
│
├── filters/
│   └── global-exception.filter.ts    ← catches all, returns { statusCode, errorCode, message, timestamp, path }
│
├── guards/
│   ├── jwt-auth.guard.ts             ← extends AuthGuard('jwt'), global
│   ├── tenant-isolation.guard.ts     ← verifies req.user.tenantId is present and consistent
│   └── roles.guard.ts                ← reads @Roles() metadata, checks req.user.roles
│
├── interceptors/
│   ├── tenant-context.interceptor.ts ← sets req.tenantId from req.user.tenantId for convenience
│   └── logging.interceptor.ts        ← structured JSON request/response logging
│
├── interfaces/
│   ├── contracts/
│   │   ├── user-query.contract.ts    ← exact interfaces above
│   │   ├── tenant-query.contract.ts
│   │   └── workflow-query.contract.ts
│   ├── events/
│   │   ├── auth-events.interface.ts  ← IUserCreatedEvent, IUserDeactivatedEvent, IUserRolesUpdatedEvent
│   │   ├── tenant-events.interface.ts← ITenantCreatedEvent, ITenantDeactivatedEvent
│   │   └── workflow-events.interface.ts ← IWorkflowTransitionCompletedEvent, IWorkflowInstanceCreatedEvent, etc.
│   └── jwt-payload.interface.ts      ← IJwtPayload { sub, email, tenantId, tenantSlug, roles, plan, firstName }
│
├── middlewares/
│   └── (empty for now — rate limiting middleware goes here when needed)
│
└── utils/
    ├── uuid.util.ts                  ← generateUUID(), isValidUUID()
    └── date.util.ts                  ← toISOString(), now()
```

### Event Payload Interfaces — Implement All

```typescript
// auth-events.interface.ts
export interface IUserCreatedEvent {
  eventId: string;
  tenantId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  occurredAt: string;
}

export interface IUserDeactivatedEvent {
  eventId: string;
  tenantId: string;
  userId: string;
  occurredAt: string;
}

export interface IUserRolesUpdatedEvent {
  eventId: string;
  tenantId: string;
  userId: string;
  roles: string[];
  occurredAt: string;
}

// workflow-events.interface.ts
export interface IWorkflowTransitionCompletedEvent {
  eventId: string;
  tenantId: string;
  instanceId: string;
  workflowDefinitionId: string;
  fromState: string;
  toState: string;
  transitionId: string;
  transitionName: string;
  performedByUserId: string;
  performedByEmail: string;
  performedByRole: string;
  comment?: string;
  instancePayload: Record<string, unknown>;
  occurredAt: string;
}

export interface IWorkflowInstanceCreatedEvent {
  eventId: string;
  tenantId: string;
  instanceId: string;
  workflowDefinitionId: string;
  initialState: string;
  createdByUserId: string;
  occurredAt: string;
}
```

---

### `src/modules/auth` — Full Specification

**Internal structure:**

```
auth/
├── commands/                         ← CQRS commands (if using cqrs here)
├── controllers/
│   ├── auth.controller.ts            ← POST /auth/login, POST /auth/refresh, POST /auth/logout
│   └── user.controller.ts            ← GET /users, POST /users, PATCH /users/:id, DELETE /users/:id
├── services/
│   ├── auth.service.ts               ← login, refresh, logout logic
│   ├── user.service.ts               ← internal user CRUD — NOT exported from module
│   └── user-query.service.ts         ← implements IUserQueryContract — the ONLY exported service
├── repositories/
│   ├── user.repository.ts
│   ├── role.repository.ts
│   └── refresh-token.repository.ts
├── entities/
│   ├── user.entity.ts
│   ├── role.entity.ts
│   ├── permission.entity.ts
│   ├── user-role.entity.ts
│   └── refresh-token.entity.ts
├── dto/
│   ├── login.dto.ts
│   ├── register.dto.ts
│   ├── create-user.dto.ts
│   └── assign-role.dto.ts
├── strategies/
│   └── jwt.strategy.ts               ← validates JWT, populates req.user as IJwtPayload
├── guards/
│   └── local.guard.ts                ← used only for login endpoint
├── publishers/
│   └── auth.publisher.ts             ← publishes USER_CREATED, USER_DEACTIVATED, USER_ROLES_UPDATED
└── auth.module.ts
    ← imports: JwtModule, PassportModule
    ← providers: AuthService, UserService, UserQueryService, all repositories, JwtStrategy
    ← provides: { provide: USER_QUERY_CONTRACT, useClass: UserQueryService }
    ← exports: [USER_QUERY_CONTRACT]   ← ONLY this token, nothing else
```

**Key logic in `auth.service.ts`:**

- `login`: validate credentials, load roles, issue JWT with full payload, issue refresh token (store hash)
- `refresh`: validate refresh token hash, rotate (revoke old, issue new pair)
- `logout`: revoke refresh token by setting `revoked_at`

**Key logic in `user-query.service.ts`:**

- Implements `IUserQueryContract`
- Thin facade over `UserRepository` — only exposes `UserSummary` shape, not full entity
- This is what gets swapped for a gRPC client on microservice extraction

---

### `src/modules/tenant` — Full Specification

```
tenant/
├── controllers/
│   └── tenant.controller.ts          ← CRUD for tenants, settings, feature flags
├── services/
│   ├── tenant.service.ts             ← internal full CRUD
│   └── tenant-query.service.ts       ← implements ITenantQueryContract
├── repositories/
│   ├── tenant.repository.ts
│   ├── tenant-settings.repository.ts
│   └── tenant-feature-flag.repository.ts
├── entities/
│   ├── tenant.entity.ts
│   ├── tenant-settings.entity.ts
│   └── tenant-feature-flag.entity.ts
├── dto/
├── publishers/
│   └── tenant.publisher.ts           ← TENANT_CREATED, TENANT_DEACTIVATED
└── tenant.module.ts
    ← imports: [AuthModule]            ← to use USER_QUERY_CONTRACT
    ← provides: { provide: TENANT_QUERY_CONTRACT, useClass: TenantQueryService }
    ← exports: [TENANT_QUERY_CONTRACT]
```

---

### `src/modules/rule-engine` — Full Specification

```
rule-engine/
├── services/
│   └── rule-engine.service.ts        ← evaluateRules(rules, context) → { passed: boolean, failedRules: string[] }
├── evaluators/
│   ├── condition.evaluator.ts        ← wraps json-rules-engine Engine
│   └── rule-context.builder.ts       ← builds context object from instance + user
├── entities/
│   └── rule-template.entity.ts       ← optional convenience table
└── rule-engine.module.ts
    ← NO imports from other modules
    ← exports: [RuleEngineService]    ← can be exported directly (no DB tables of its own to guard)
```

**`rule-engine.service.ts` signature:**

```typescript
async evaluateRules(
  rules: RuleDefinition[],
  context: RuleContext
): Promise<RuleEvaluationResult>

interface RuleContext {
  payload: Record<string, unknown>;    // instance.payload
  user: { id: string; role: string; roles: string[] };
  instance: { currentState: string; createdAt: string };
}

interface RuleEvaluationResult {
  passed: boolean;
  failedRules: Array<{ ruleName: string; reason: string }>;
}
```

---

### `src/modules/workflow-definition` — Full Specification

```
workflow-definition/
├── controllers/
│   ├── workflow-definition.controller.ts   ← CRUD + publish + deprecate
│   ├── workflow-state.controller.ts
│   └── workflow-transition.controller.ts
├── services/
│   ├── workflow-definition.service.ts
│   ├── workflow-state.service.ts
│   ├── workflow-transition.service.ts
│   ├── workflow-version.service.ts         ← handles snapshot creation on publish
│   └── workflow-query.service.ts           ← implements IWorkflowQueryContract
├── repositories/
│   ├── workflow-definition.repository.ts
│   ├── workflow-state.repository.ts
│   ├── workflow-transition.repository.ts
│   ├── transition-rule.repository.ts
│   └── workflow-version.repository.ts
├── entities/
│   ├── workflow-definition.entity.ts
│   ├── workflow-definition-version.entity.ts
│   ├── workflow-state.entity.ts
│   ├── workflow-transition.entity.ts
│   ├── transition-rule.entity.ts
│   └── instance-form-schema.entity.ts
├── dto/
│   ├── create-workflow-definition.dto.ts
│   ├── create-workflow-state.dto.ts
│   ├── create-workflow-transition.dto.ts
│   └── create-transition-rule.dto.ts
├── publishers/
│   └── workflow-definition.publisher.ts    ← WORKFLOW_DEFINITION_PUBLISHED, WORKFLOW_DEFINITION_DEPRECATED
└── workflow-definition.module.ts
    ← provides: { provide: WORKFLOW_QUERY_CONTRACT, useClass: WorkflowQueryService }
    ← exports: [WORKFLOW_QUERY_CONTRACT]
```

**Publish logic in `workflow-version.service.ts`:**

1. Load all states + transitions + transition_rules for this definition
2. Serialize to snapshot JSONB
3. Create `WorkflowDefinitionVersion` record with snapshot + version number
4. Set `is_active = true` on new version, `is_active = false` on all previous
5. Update `workflow_definitions.current_version` and `status = 'published'`
6. Publish `WORKFLOW_DEFINITION_PUBLISHED` event

---

### `src/modules/workflow-execution` — Full Specification

```
workflow-execution/
├── commands/
│   ├── create-instance.command.ts
│   ├── execute-transition.command.ts
│   └── cancel-instance.command.ts
├── queries/
│   ├── get-instance-detail.query.ts
│   ├── get-instance-list.query.ts
│   └── get-allowed-transitions.query.ts
├── handlers/
│   ├── create-instance.handler.ts
│   ├── execute-transition.handler.ts
│   └── cancel-instance.handler.ts
├── controllers/
│   └── workflow-execution.controller.ts
├── services/
│   ├── workflow-execution.service.ts       ← dispatches commands/queries via CommandBus/QueryBus
│   └── transition-executor.service.ts      ← core execution: load snapshot → validate → eval rules → transition
├── repositories/
│   ├── workflow-instance.repository.ts
│   └── user-shadow.repository.ts           ← Pattern 3 shadow table queries
├── entities/
│   ├── workflow-instance.entity.ts
│   └── we-user-shadow.entity.ts            ← shadow table entity (table: 'we_user_shadows')
├── subscribers/
│   └── auth-events.subscriber.ts           ← listens USER_CREATED, USER_DEACTIVATED, USER_ROLES_UPDATED → sync shadow
├── publishers/
│   └── execution.publisher.ts              ← publishes WORKFLOW_INSTANCE_CREATED, WORKFLOW_TRANSITION_COMPLETED, etc.
└── workflow-execution.module.ts
    ← imports: [CqrsModule, RuleEngineModule, WorkflowDefinitionModule]
    ← no export needed (leaf module)
```

**`execute-transition.handler.ts` — Core Transition Logic:**

```
1. Load instance (check tenant_id match)
2. Load workflow definition version snapshot (from WorkflowQuery contract)
3. Verify transition exists in snapshot from current state
4. Check user's role is in transition.allowed_role_ids
5. Evaluate transition_rules via RuleEngineService
6. If rules fail → throw 422 UnprocessableEntityException with failed rule names
7. ATOMIC DB TRANSACTION:
   a. UPDATE workflow_instances
      SET current_state_id = :newStateId,
          current_state_name = :newStateName,
          version = version + 1,
          status = (isTerminal ? 'completed' : 'active'),
          updated_at = now()
      WHERE id = :instanceId AND version = :expectedVersion AND tenant_id = :tenantId
   b. IF 0 rows updated → ROLLBACK → throw 409 ConflictException('TRANSITION_CONFLICT')
   c. INSERT INTO audit_logs (within same transaction)
8. Publish WORKFLOW_TRANSITION_COMPLETED event (after transaction commits)
9. Return updated instance with new state + allowed next transitions
```

---

### `src/modules/audit` — Full Specification

```
audit/
├── controllers/
│   └── audit.controller.ts           ← GET /instances/:id/audit-logs (paginated)
├── services/
│   └── audit.service.ts              ← query audit logs with filters
├── repositories/
│   └── audit-log.repository.ts       ← append-only, findByInstanceId with pagination
├── entities/
│   └── audit-log.entity.ts           ← no updatedAt, readonly fields
├── subscribers/
│   └── audit.subscriber.ts           ← listens to execution events, verifies eventId idempotency
└── audit.module.ts
```

**IMPORTANT:** `audit.subscriber.ts` must check `eventId` uniqueness before writing:

```typescript
const existing = await this.auditLogRepository.findByEventId(data.eventId);
if (existing) return; // idempotent — already processed
await this.auditLogRepository.insert({ ...auditData, eventId: data.eventId });
```

---

### `src/modules/notification` — Full Specification

```
notification/
├── controllers/
│   ├── notification-template.controller.ts
│   └── webhook-config.controller.ts
├── services/
│   ├── notification.service.ts       ← email sending logic (nodemailer or AWS SES)
│   └── webhook.service.ts            ← HTTP POST with HMAC-SHA256 signature header
├── repositories/
│   ├── notification-template.repository.ts
│   ├── notification-log.repository.ts
│   ├── webhook-config.repository.ts
│   └── webhook-delivery-log.repository.ts
├── entities/
│   ├── notification-template.entity.ts
│   ├── notification-log.entity.ts
│   ├── webhook-config.entity.ts
│   └── webhook-delivery-log.entity.ts
├── subscribers/
│   └── notification.subscriber.ts    ← listens to workflow events, finds matching templates, sends
└── notification.module.ts
```

**Webhook signature header:** `X-Workflow-Signature: sha256=<hmac-sha256-hex>`

---

### `src/infra` — Infrastructure Configs

```
src/infra/
├── typeorm.config.ts               ← TypeORM DataSource options (reads from ConfigService)
├── redis.config.ts                 ← ioredis client factory
├── nats.config.ts                  ← NATS ClientProxy options
└── index.ts                        ← barrel export
```

**NATS Client registration in `app.module.ts`:**

```typescript
ClientsModule.registerAsync([
  {
    name: "NATS_CLIENT",
    useFactory: (configService: ConfigService) => ({
      transport: Transport.NATS,
      options: { servers: [configService.get("NATS_URL")] },
    }),
    inject: [ConfigService],
  },
]);
```

---

### `src/app.module.ts` — Root Module

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: joiSchema }),
    TypeOrmModule.forRootAsync({ useFactory: typeormConfig }),
    ClientsModule.registerAsync([natsClientConfig]), // global NATS client
    AuthModule,
    TenantModule,
    RuleEngineModule,
    WorkflowDefinitionModule,
    WorkflowExecutionModule,
    AuditModule,
    NotificationModule,
    HealthModule,
    DatabaseModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // global JWT auth
    { provide: APP_GUARD, useClass: TenantIsolationGuard }, // global tenant isolation
    { provide: APP_GUARD, useClass: RolesGuard }, // global RBAC
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
```

**Skip auth for:** `POST /auth/login`, `POST /auth/refresh`, `GET /health`, `GET /health/ready` — use `@Public()` decorator.

---

### `src/main.ts` — Bootstrap

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // NATS microservice hybrid for receiving events
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.NATS,
    options: { servers: [process.env.NATS_URL] },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix("api/v1");
  app.enableCors();

  // Swagger
  const config = new DocumentBuilder()
    .setTitle("Workflow Engine API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config));

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);
}
```

---

### `docker/docker-compose.yml` — Complete

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: workflow_engine
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --appendonly yes
    volumes: [redis_data:/data]

  nats:
    image: nats:2.10-alpine
    ports: ["4222:4222", "8222:8222"]
    command: ["-js", "-m", "8222"] # JetStream enabled + monitoring

  api:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/workflow_engine
      REDIS_URL: redis://redis:6379
      NATS_URL: nats://nats:4222
      JWT_SECRET: local-dev-secret-change-in-prod
      JWT_EXPIRES_IN: 15m
      REFRESH_TOKEN_EXPIRES_IN: 7d
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
      nats: { condition: service_started }

volumes:
  postgres_data:
  redis_data:
```

---

### `database/data-source.ts` — Migration CLI

```typescript
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
dotenv.config();

export default new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: ["src/**/*.entity.ts"],
  migrations: ["database/migrations/*.ts"],
  migrationsTableName: "typeorm_migrations",
});
```

---

## API Endpoints (Complete Contract)

### Auth

```
POST   /api/v1/auth/login              → { accessToken, refreshToken, user }
POST   /api/v1/auth/refresh            → { accessToken, refreshToken }
POST   /api/v1/auth/logout             → 204

GET    /api/v1/users                   → paginated users (Admin only)
POST   /api/v1/users                   → create user (Admin only)
PATCH  /api/v1/users/:id               → update user
DELETE /api/v1/users/:id               → deactivate user (soft)
POST   /api/v1/users/:id/roles         → assign roles
```

### Tenant

```
POST   /api/v1/tenants                 → create tenant (super admin only)
GET    /api/v1/tenants/me              → current tenant details
PATCH  /api/v1/tenants/me             → update settings
GET    /api/v1/tenants/me/feature-flags
PATCH  /api/v1/tenants/me/feature-flags/:key
```

### Workflow Definition

```
GET    /api/v1/workflow-definitions           → list (paginated)
POST   /api/v1/workflow-definitions           → create
GET    /api/v1/workflow-definitions/:id       → get with states + transitions
PATCH  /api/v1/workflow-definitions/:id       → update (only if draft)
DELETE /api/v1/workflow-definitions/:id       → soft delete
POST   /api/v1/workflow-definitions/:id/publish    → publish (creates version snapshot)
POST   /api/v1/workflow-definitions/:id/deprecate  → deprecate

POST   /api/v1/workflow-definitions/:id/states          → add state
PATCH  /api/v1/workflow-definitions/:id/states/:stateId → update state
DELETE /api/v1/workflow-definitions/:id/states/:stateId → delete state

POST   /api/v1/workflow-definitions/:id/transitions                        → add transition
PATCH  /api/v1/workflow-definitions/:id/transitions/:transitionId          → update
DELETE /api/v1/workflow-definitions/:id/transitions/:transitionId          → delete
POST   /api/v1/workflow-definitions/:id/transitions/:transitionId/rules    → add rule
DELETE /api/v1/workflow-definitions/:id/transitions/:transitionId/rules/:ruleId → delete rule
```

### Workflow Execution

```
GET    /api/v1/instances                    → list (paginated, filterable by status/definition)
POST   /api/v1/instances                    → create instance
GET    /api/v1/instances/:id                → get detail + allowed transitions
POST   /api/v1/instances/:id/transition     → execute transition { transitionId, comment?, idempotencyKey }
POST   /api/v1/instances/:id/cancel         → cancel instance
```

### Audit

```
GET    /api/v1/instances/:id/audit-logs     → paginated, chronological
```

### Notification

```
GET    /api/v1/notification-templates
POST   /api/v1/notification-templates
PATCH  /api/v1/notification-templates/:id
DELETE /api/v1/notification-templates/:id

GET    /api/v1/webhook-configs
POST   /api/v1/webhook-configs
PATCH  /api/v1/webhook-configs/:id
DELETE /api/v1/webhook-configs/:id
```

### Health

```
GET    /health        → { status: 'ok' | 'error', details: { db, redis, nats } }
GET    /health/ready  → 200 if ready to serve traffic
```

---

## Environment Variables Schema

```env
# App
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/workflow_engine

# Redis
REDIS_URL=redis://localhost:6379

# NATS
NATS_URL=nats://localhost:4222

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Email (optional for dev)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@workflow-engine.dev
```

---

<!-- ## Testing Requirements -->

<!-- For each module, create:

- `*.service.spec.ts` — unit tests with mocked repositories
- `*.controller.spec.ts` — unit tests with mocked services
- `e2e/` — at minimum one e2e test per critical path:
  - Full transition flow: create instance → execute transition → verify audit log
  - Concurrent transition conflict: two simultaneous transitions → one 409
  - Rule evaluation: transition blocked by failed rule -->

---

## Code Quality Standards

- Every public method has JSDoc with `@param` and `@returns`
- Every DTO field has `@ApiProperty()` from `@nestjs/swagger`
- No `console.log` — use NestJS `Logger` with structured context
- Repository methods are typed — no raw query returns `any`
- All async operations use `async/await` — no `.then()` chains
- TypeORM transactions use `QueryRunner` pattern explicitly
- Idempotency keys on all state-mutating endpoints (stored in Redis with 24h TTL to detect duplicates)

---

## Migration Files to Generate

Generate TypeORM migration files in `database/migrations/` in this order:

1. `001_create_tenants.ts`
2. `002_create_tenant_settings_and_flags.ts`
3. `003_create_users_roles_permissions.ts`
4. `004_create_refresh_tokens.ts`
5. `005_create_workflow_definitions.ts`
6. `006_create_workflow_states_and_transitions.ts`
7. `007_create_transition_rules_and_form_schemas.ts`
8. `008_create_workflow_definition_versions.ts`
9. `009_create_workflow_instances.ts`
10. `010_create_we_user_shadows.ts`
11. `011_create_audit_logs.ts`
12. `012_create_audit_immutability_trigger.ts` ← DB trigger for audit log immutability
13. `013_create_notification_tables.ts`
14. `014_create_rule_templates.ts`
15. `015_create_indexes.ts` ← all composite indexes
16. `016_create_rls_policies.ts` ← PostgreSQL Row-Level Security

---

## Start Here — First Files to Write

Begin in this exact order:

1. `libs/shared/src/constants/nats-events.enum.ts`
2. `libs/shared/src/constants/app-errors.enum.ts`
3. `libs/shared/src/interfaces/jwt-payload.interface.ts`
4. `libs/shared/src/interfaces/contracts/user-query.contract.ts`
5. `libs/shared/src/interfaces/contracts/tenant-query.contract.ts`
6. `libs/shared/src/interfaces/contracts/workflow-query.contract.ts`
7. `libs/shared/src/interfaces/events/auth-events.interface.ts`
8. `libs/shared/src/interfaces/events/tenant-events.interface.ts`
9. `libs/shared/src/interfaces/events/workflow-events.interface.ts`
10. `libs/shared/src/entities/base.entity.ts`
11. `libs/shared/src/dto/pagination.dto.ts`
12. `libs/shared/src/dto/id-param.dto.ts`
13. `libs/shared/src/decorators/current-user.decorator.ts`
14. `libs/shared/src/decorators/tenant-id.decorator.ts`
15. `libs/shared/src/decorators/roles.decorator.ts`
16. `libs/shared/src/guards/jwt-auth.guard.ts`
17. `libs/shared/src/guards/tenant-isolation.guard.ts`
18. `libs/shared/src/guards/roles.guard.ts`
19. `libs/shared/src/filters/global-exception.filter.ts`
20. `libs/shared/src/interceptors/tenant-context.interceptor.ts`
21. `libs/shared/src/interceptors/logging.interceptor.ts`
22. `libs/shared/src/utils/uuid.util.ts`
23. `libs/shared/src/utils/date.util.ts`
24. `libs/shared/src/index.ts` (barrel export)

Then proceed to `database/data-source.ts`, then `src/infra/`, then modules in build order.

---

## Final Checklist Before Declaring Any Module Complete

For each module, verify:

- [ ] Entity extends `BaseEntity` (has `id`, `tenantId`, `createdAt`, `updatedAt`)
- [ ] All repository queries include `WHERE tenant_id = :tenantId`
- [ ] Module only exports what it intends to expose (contract tokens only)
- [ ] No direct repository import from another module
- [ ] Publishers only publish, subscribers only subscribe
- [ ] All NATS event names use `NatsEvents` enum
- [ ] All NATS event payloads implement the correct interface from `libs/shared`
- [ ] All event payloads include `eventId` and `occurredAt`
- [ ] Subscribers check `eventId` for idempotency before processing
- [ ] All DTOs have `class-validator` decorators and `@ApiProperty()`
- [ ] No `any` type used anywhere
- [ ] All service methods handle errors with typed exceptions from `AppErrors` enum
