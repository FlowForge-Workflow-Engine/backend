---
title: Database Design Documentation
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# Database Design Documentation

## Table of Contents

- [Database Design Documentation](#database-design-documentation)
  - [Table of Contents](#table-of-contents)
  - [1. Overview](#1-overview)
    - [1.1 Database Technology Choice (PostgreSQL)](#11-database-technology-choice-postgresql)
    - [1.2 Schema Design Philosophy](#12-schema-design-philosophy)
    - [1.3 Multi-Tenancy Strategy](#13-multi-tenancy-strategy)
  - [2. Table Catalogue](#2-table-catalogue)
    - [2.1 Auth Tables](#21-auth-tables)
    - [2.2 Tenant Tables](#22-tenant-tables)
    - [2.3 Workflow Definition Tables](#23-workflow-definition-tables)
    - [2.4 Workflow Execution Tables](#24-workflow-execution-tables)
    - [2.5 Audit Tables](#25-audit-tables)
    - [2.6 Notification Tables](#26-notification-tables)
  - [3. Entity Relationship Overview](#3-entity-relationship-overview)
    - [3.1 Core Entity Groups](#31-core-entity-groups)
    - [3.2 Cross-Context Relationships](#32-cross-context-relationships)
  - [4. Row-Level Security (RLS)](#4-row-level-security-rls)
    - [4.1 RLS Strategy Overview](#41-rls-strategy-overview)
    - [4.2 Tenant Isolation via RLS](#42-tenant-isolation-via-rls)
    - [4.3 RLS Policy Catalogue](#43-rls-policy-catalogue)
    - [4.4 RLS Testing Strategy](#44-rls-testing-strategy)
  - [5. Migration Strategy](#5-migration-strategy)
    - [5.1 Migration Tool & Convention](#51-migration-tool--convention)
    - [5.2 Migration File Catalogue](#52-migration-file-catalogue)
    - [5.3 Zero-Downtime Migration Patterns Used](#53-zero-downtime-migration-patterns-used)
  - [6. Indexing Strategy](#6-indexing-strategy)
    - [6.1 Index Catalogue](#61-index-catalogue)
    - [6.2 Indexing Decision Framework](#62-indexing-decision-framework)
  - [7. Concurrency Control](#7-concurrency-control)
    - [7.1 Optimistic vs Pessimistic Locking Decisions](#71-optimistic-vs-pessimistic-locking-decisions)
    - [7.2 Version Columns / Timestamps](#72-version-columns--timestamps)
  - [8. Data Retention & Soft Delete Strategy](#8-data-retention--soft-delete-strategy)
  - [9. Backup & Recovery Strategy (Conceptual)](#9-backup--recovery-strategy-conceptual)
  - [10. Performance Tuning Notes](#10-performance-tuning-notes)
    - [10.1 Query Optimization Patterns](#101-query-optimization-patterns)
    - [10.2 Connection Pooling](#102-connection-pooling)
    - [10.5 Tenancy Models Available and Recommendation](#105-tenancy-models-available-and-recommendation)

---

## 1. Overview

### 1.1 Database Technology Choice (PostgreSQL)

**Decision:** Use **PostgreSQL** as the primary transactional database, with selective use of JSONB for semi-structured data.

**Alternatives considered:**

- MySQL:
  - Mature, widely supported.
  - Weaker native support for JSON querying and Row-Level Security.
  - Less ergonomic for complex relational plus JSON workloads.
- MongoDB / other NoSQL:
  - Flexible schemas, horizontal scaling.
  - Weak transactional guarantees across documents, complex to enforce relational invariants.

**Why PostgreSQL is chosen:**

- **Relational integrity:** The workflow domain is inherently relational:
  - definitions → states → transitions → rules,
  - users → roles → permissions,
  - instances → audit logs.
    PostgreSQL’s foreign keys, constraints, and transactions are a natural fit.

- **JSONB support:** Workflow payloads, rule ASTs, notification/webhook payloads, and configuration blobs are represented as JSONB, enabling:
  - flexible per-tenant payload schemas,
  - efficient indexing on JSON fields if needed,
  - simple storage and retrieval of rule definitions (`transition_rules.rule_definition`).

- **Row-Level Security (RLS):** PostgreSQL’s RLS provides a first-class, DB-enforced tenant isolation mechanism:
  - even buggy application code cannot accidentally leak data across tenants,
  - RLS policies are managed centrally in migrations.

- **ACID transactions:** Transitions must atomically:
  - update `workflow_instances`,
  - write `audit_logs`,
  - emit idempotent events.
    PostgreSQL supports these patterns reliably.

- **Ecosystem and operational maturity:**
  - broad support in cloud providers,
  - managed offerings with Multi-AZ, backups, and read replicas,
  - well-understood tooling for performance monitoring and scaling.

**Trade-offs:**

- Requires careful schema design and indexing to avoid performance issues at tens of millions of rows.
- Horizontal write scaling requires sharding or advanced partitioning, but the current SLAs are achievable on a well-tuned single cluster with read replicas.

### 1.2 Schema Design Philosophy

The schema is designed around strict module boundaries, microservice extractability, and explicit data loading. The following content is from `SCHEMA_DESIGN_PHILOSOPHY.md` and is included verbatim.

## Schema Design Philosophy

### Overview

This document explains why the Multi-Tenant Workflow Engine uses **minimal ORM relations** and stores foreign keys as plain UUID strings instead of TypeORM `@ManyToOne` / `@OneToMany` decorators.

This is a **deliberate architectural decision** for a **Modular Monolith** designed to be **microservice-extractable** without rewrites.

---

### Core Principles

#### 1. Module Boundary Enforcement

**Problem**: ORM relations create implicit cross-module dependencies.

If `WorkflowState` defined a `@ManyToOne` relation to `WorkflowDefinition`:

```typescript
// ❌ WRONG: Creates tight coupling
@ManyToOne(() => WorkflowDefinition)
@JoinColumn({ name: "workflow_definition_id" })
definition: WorkflowDefinition;
```

TypeORM would:

- Automatically load the related entity
- Create a hard dependency on `WorkflowDefinition` in the entity layer
- Make it impossible to lazy-load or use contracts
- Violate the **Module Boundary Rule**: "A module's internal Service is NEVER directly injected into another module"

**Solution**: Store only the UUID, access via contracts:

```typescript
// ✅ CORRECT: Loose coupling
@Column({ type: "uuid", name: "workflow_definition_id" })
workflowDefinitionId: string;

// Access via contract in service layer
@Inject(WORKFLOW_QUERY_CONTRACT)
private workflowQuery: IWorkflowQueryContract;

const definition = await this.workflowQuery.findById(id, tenantId);
```

---

### 2. Microservice Extractability

**Goal**: Extract modules into separate microservices with **zero entity refactoring**.

**With Relations**:

```typescript
// Current: WorkflowState has @ManyToOne WorkflowDefinition
const state = await stateRepo.find(); // loads definition from DB

// After extraction: Must remove @ManyToOne, rewrite queries
const state = await stateRepo.find(); // now calls HTTP client
// ❌ Entity definition changed — breaking change
```

**Without Relations**:

```typescript
// Current: WorkflowState stores workflowDefinitionId UUID
const state = await stateRepo.find(); // just returns state

// After extraction: Repository implementation changes, entity stays same
const state = await stateRepo.find(); // still returns state
// ✅ Entity definition unchanged — seamless extraction
```

---

### 3. Explicit Data Loading (N+1 Prevention)

**Problem**: ORM relations hide query complexity.

```typescript
// ❌ IMPLICIT: Hidden query, hard to optimize
const states = await stateRepo.find(); // 1 query
states.forEach((s) => s.definition); // N queries (N+1 problem)
```

**Solution**: Explicit loading forces performance awareness:

```typescript
// ✅ EXPLICIT: You control what's loaded
const states = await stateRepo.find(); // 1 query
const definitions = await definitionRepo.findManyByIds(states.map((s) => s.workflowDefinitionId)); // 1 query (batch load)
```

---

### 4. Tenant Isolation Safety

**Problem**: Relations can accidentally bypass tenant isolation.

```typescript
// ❌ DANGEROUS: What if definition.tenantId !== state.tenantId?
const state = await stateRepo.findById(id);
const definition = state.workflowDefinition; // loaded via relation
// No tenant validation — potential data leak
```

**Solution**: Explicit tenant validation on every access:

```typescript
// ✅ SAFE: Explicit tenant check
const state = await stateRepo.findById(id, tenantId);
const definition = await definitionRepo.findById(
  state.workflowDefinitionId,
  tenantId, // ← explicit tenant validation
);
// Tenant isolation enforced at every layer
```

---

### 5. Contract-Based Communication

The architecture uses **contracts** (interfaces) for cross-module access, not ORM relations.

```typescript
// ✅ CORRECT: Use contract token
@Inject(WORKFLOW_QUERY_CONTRACT)
private workflowQuery: IWorkflowQueryContract;

const definition = await this.workflowQuery.findById(id, tenantId);

// ❌ WRONG: Direct entity relation
const definition = state.workflowDefinition;
```

Contracts provide:

- **Loose coupling**: Module A doesn't know Module B's implementation
- **Testability**: Easy to mock contracts in tests
- **Flexibility**: Swap implementations (DB → HTTP → gRPC) without changing callers

---

## When Relations ARE Used

Relations **ARE defined** where appropriate — within the same module:

### ✅ `UserRole` (Join Table in AuthModule)

```typescript
@ManyToOne(() => User, (u) => u.userRoles, { onDelete: "CASCADE" })
@JoinColumn({ name: "user_id" })
user: User;

@ManyToOne(() => Role, (r) => r.userRoles, { onDelete: "CASCADE" })
@JoinColumn({ name: "role_id" })
role: Role;
```

**Why?** Because:

- Both `User` and `Role` are in the same module (`AuthModule`)
- No cross-module boundary violation
- Cascade delete is needed for data integrity
- Join tables are internal implementation details

### ✅ `User` and `Role` (OneToMany)

```typescript
@OneToMany(() => UserRole, (ur) => ur.user)
userRoles: UserRole[];
```

**Why?** Because:

- Relation is to a join table (not another aggregate)
- Same module — safe to couple
- Enables navigation for internal queries

---

## The Pattern

```
SAME MODULE (AuthModule):
  User ←→ UserRole ←→ Role
  ✅ Relations OK — tight coupling is acceptable within a module

CROSS MODULE:
  WorkflowState (workflow-definition) → WorkflowDefinition (workflow-definition)
  ✅ NO relation — store only workflowDefinitionId UUID

  WorkflowInstance (workflow-execution) → WorkflowDefinition (workflow-definition)
  ✅ NO relation — store only workflowDefinitionId UUID

  AuditLog (audit) → User (auth)
  ✅ NO relation — store only userId UUID + snapshot fields (email, role)
```

---

## Workflow-Definition Module: Aggregate Root Pattern

The workflow-definition module is a **perfect example** of the modular monolith design using the **Aggregate Root pattern** from Domain-Driven Design.

### Entity Hierarchy

```
WorkflowDefinition (aggregate root)
├── WorkflowState[] (children)
├── WorkflowTransition[] (children)
│   └── TransitionRule[] (grandchildren)
├── InstanceFormSchema (child, 1:1)
└── WorkflowDefinitionVersion[] (children)
```

**This is NOT a relational graph — it's a hierarchical tree.** In a tree, you navigate by ID, not by ORM relations.

### Why No Relations Between Workflow Entities

#### 1. Explicit Aggregate Loading

Without relations, you load the aggregate intentionally:

```typescript
// ✅ CORRECT: Explicit aggregate loading
const definition = await definitionRepo.findById(id, tenantId);
const states = await stateRepo.findByDefinitionId(id, tenantId);
const transitions = await transitionRepo.findByDefinitionId(id, tenantId);
const rules = await ruleRepo.findByTransitionIds(transitionIds, tenantId);
// You control what's loaded and in what order
```

With relations, you'd have implicit cascading loads:

```typescript
// ❌ WRONG: Hidden queries
const definition = await definitionRepo.find(); // loads all states, transitions, rules
// N+1 queries, unpredictable performance
```

#### 2. Snapshot Pattern (Immutability)

`WorkflowDefinitionVersion` stores a **frozen snapshot** of the entire definition at publish time:

```typescript
snapshot: {
  name: "Approval Workflow",
  states: [
    { id: "...", name: "Draft", isInitial: true },
    { id: "...", name: "Approved", isTerminal: true }
  ],
  transitions: [
    { id: "...", fromStateId: "...", toStateId: "..." }
  ],
  rules: [...]
}
```

**Why no relation to WorkflowState/Transition?**

- The snapshot is **immutable** — it's a point-in-time copy
- Live `WorkflowState` rows can be modified after publication
- Running instances use the snapshot, not live rows
- A relation would create confusion: "Should I use the snapshot or the live entity?"

```typescript
// ✅ CORRECT: Snapshot is self-contained
const version = await versionRepo.findById(versionId);
const definition = version.snapshot; // everything needed is here

// ❌ WRONG: Relation would be confusing
const version = await versionRepo.findById(versionId);
const states = version.workflowDefinition.states; // which states? live or snapshot?
```

#### 3. Execution Module Isolation

`WorkflowExecutionModule` needs to execute transitions, but it should **never** depend on `WorkflowDefinitionModule`'s internal structure.

**Without relations**:

```typescript
// WorkflowExecutionModule
@Inject(WORKFLOW_QUERY_CONTRACT)
private workflowQuery: IWorkflowQueryContract;

// Get the snapshot — immutable, versioned
const version = await this.workflowQuery.getVersionSnapshot(
  definitionId,
  versionNumber
);

// Execute using snapshot
const allowed = this.canTransition(version.snapshot, currentState);
```

**With relations**:

```typescript
// ❌ WRONG: Execution depends on live definition
const definition = await definitionRepo.findById(id);
const states = definition.states; // live states, can change mid-execution!
// Risk: Definition changes while instance is executing
```

#### 4. Versioning & Publishing

When you publish a workflow, you **assemble** the snapshot from multiple sources:

```typescript
// ✅ CORRECT: Create immutable snapshot
const definition = await definitionRepo.findById(id, tenantId);
const states = await stateRepo.findByDefinitionId(id, tenantId);
const transitions = await transitionRepo.findByDefinitionId(id, tenantId);

// Create snapshot
const snapshot = {
  name: definition.name,
  states: states.map(s => ({ id: s.id, name: s.name, ... })),
  transitions: transitions.map(t => ({ id: t.id, ... })),
};

// Save as immutable version
await versionRepo.save({
  workflowDefinitionId: id,
  versionNumber: definition.currentVersion,
  snapshot,
  isActive: true,
});
```

Relations don't help here — you still need explicit mapping.

#### 5. Query Optimization

Without relations, you optimize queries per use case:

```typescript
// Use case 1: Get definition summary (no children)
const definition = await definitionRepo.findById(id, tenantId);

// Use case 2: Get definition with states only
const definition = await definitionRepo.findById(id, tenantId);
const states = await stateRepo.findByDefinitionId(id, tenantId);

// Use case 3: Get full definition (all children)
const definition = await definitionRepo.findById(id, tenantId);
const states = await stateRepo.findByDefinitionId(id, tenantId);
const transitions = await transitionRepo.findByDefinitionId(id, tenantId);
const rules = await ruleRepo.findByTransitionIds(transitionIds, tenantId);
```

With relations, you'd always load everything — wasteful.

#### 6. Tenant Isolation

Each entity has its own `tenantId` column. Without relations, you validate tenant isolation at every layer:

```typescript
// ✅ SAFE: Explicit tenant validation
const definition = await definitionRepo.findById(id, tenantId);
const states = await stateRepo.findByDefinitionId(id, tenantId);
// Both queries validate tenantId

// ❌ RISKY: Relation might bypass validation
const definition = await definitionRepo.findById(id);
const states = definition.states; // what if states.tenantId !== definition.tenantId?
```

### Workflow-Definition Entity Summary

| Entity                        | Why No Relations                               | How It's Used                              |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------ |
| **WorkflowDefinition**        | Aggregate root — children loaded explicitly    | Service loads states/transitions on demand |
| **WorkflowState**             | Child of definition — no back-reference needed | Loaded by ID or by definitionId            |
| **WorkflowTransition**        | Child of definition — references states by ID  | Loaded by ID or by definitionId            |
| **TransitionRule**            | Child of transition — no back-reference needed | Loaded by transitionId                     |
| **InstanceFormSchema**        | 1:1 with definition — loaded separately        | Loaded by workflowDefinitionId             |
| **WorkflowDefinitionVersion** | Immutable snapshot — self-contained            | Loaded by versionNumber, never modified    |

### The Key Insight

**Workflow-definition is NOT a relational graph — it's a hierarchical aggregate.**

```
❌ WRONG: Think of it as a relational graph
  WorkflowDefinition ←→ WorkflowState ←→ WorkflowTransition

✅ CORRECT: Think of it as a tree
  WorkflowDefinition
  ├── WorkflowState (child)
  ├── WorkflowTransition (child)
  │   └── TransitionRule (grandchild)
  └── InstanceFormSchema (child)
```

In a tree, you don't need relations — you navigate by ID. This is the **Aggregate Root pattern** from Domain-Driven Design.

---

## Conclusion

**The schema is correctly designed.** The absence of cross-module relations is a **feature**, not a bug. It's the foundation of your modular monolith architecture and enables:

1. ✅ Strict module boundaries
2. ✅ Microservice extractability
3. ✅ Explicit data loading
4. ✅ Tenant isolation safety
5. ✅ Contract-based communication
6. ✅ Aggregate root pattern (DDD)
7. ✅ Immutable snapshots for versioning

This design allows the system to scale from a monolith to microservices without entity refactoring.

### 1.3 Multi-Tenancy Strategy

- **Single shared database, shared schema**:
  - All tenants share the same tables.
  - Every tenant-scoped table has a `tenant_id` column.
- **Row-Level Security (RLS)**:
  - PostgreSQL RLS is enabled on all tenant-scoped tables.
  - Policies ensure `tenant_id = current_setting('app.tenant_id')::uuid`.
- **RLS context**:
  - Set by `DatabaseContextInterceptor` using `RlsContextService.setTenantContext(tenantId)`.
- **Separation options for future enterprise tiers**:
  - schema-per-tenant or database-per-tenant for stricter isolation, but current default optimizes for 10k+ tenants.

---

## 2. Table Catalogue

This section documents each table created by the base schema migration (`1772830603496-Migration.ts`) and how it participates in the multi-tenant model.

For each table:

- Columns are derived from migrations.
- Indexes and constraints are summarized.
- Foreign keys are noted where defined.
- RLS notes are based on the RLS migration (`1772830604496-Create-RLS-Policies.ts`).

### 2.1 Auth Tables

#### `users`

| Column              | Type           | Nullable | Default              | Description                      |
| ------------------- | -------------- | -------- | -------------------- | -------------------------------- |
| `id`                | `uuid`         | No       | `uuid_generate_v4()` | Primary key                      |
| `tenant_id`         | `uuid`         | No       |                      | Tenant this user belongs to      |
| `created_at`        | `timestamptz`  | No       | `now()`              | Creation timestamp               |
| `updated_at`        | `timestamptz`  | No       | `now()`              | Last update timestamp            |
| `email`             | `varchar(255)` | No       |                      | User email (unique per tenant)   |
| `password_hash`     | `varchar(255)` | No       |                      | Argon2 hashed password           |
| `first_name`        | `varchar(100)` | No       |                      | First name                       |
| `last_name`         | `varchar(100)` | No       |                      | Last name                        |
| `is_active`         | `boolean`      | No       | `true`               | Soft-delete flag / active status |
| `is_email_verified` | `boolean`      | No       | `false`              | Whether email has been verified  |
| `last_login_at`     | `timestamptz`  | Yes      |                      | Last login timestamp             |

**Indexes**

- `IDX_109638590074998bb72a2f2cf0` on (`tenant_id`)
- `IDX_e9f4c2efab52114c4e99e28efb` unique on (`tenant_id`, `email`)

**Constraints**

- PK: `"PK_a3ffb1c0c8416b9fc6f907b7433"` on `id`.

**Foreign Keys**

- None directly; join tables reference `users.id`.

**RLS Policies**

- `users_tenant_isolation`:
  - `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
  - `FORCE ROW LEVEL SECURITY` enabled.

---

#### `roles`

| Column           | Type           | Nullable | Default              | Description                              |
| ---------------- | -------------- | -------- | -------------------- | ---------------------------------------- |
| `id`             | `uuid`         | No       | `uuid_generate_v4()` | Primary key                              |
| `tenant_id`      | `uuid`         | No       |                      | Tenant owner                             |
| `created_at`     | `timestamptz`  | No       | `now()`              | Created                                  |
| `updated_at`     | `timestamptz`  | No       | `now()`              | Last update                              |
| `name`           | `varchar(100)` | No       |                      | Role name (`Admin`, `Approver`, etc.)    |
| `description`    | `varchar(255)` | Yes      |                      | Human-readable description               |
| `is_system_role` | `boolean`      | No       | `false`              | Whether role is system-defined or custom |

**Indexes**

- `IDX_e59a01f4fe46ebbece575d9a0f` on (`tenant_id`)
- `IDX_c555146b304b5f51a7de6e18de` unique on (`tenant_id`, `name`)

**Constraints**

- PK: `"PK_c1433d71a4838793a49dcad46ab"` on `id`.

**Foreign Keys**

- Referenced by `user_roles.role_id`.

**RLS Policies**

- `roles_tenant_isolation`:
  - `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.

---

#### `user_roles`

| Column        | Type          | Nullable | Default | Description          |
| ------------- | ------------- | -------- | ------- | -------------------- |
| `user_id`     | `uuid`        | No       |         | FK to `users.id`     |
| `role_id`     | `uuid`        | No       |         | FK to `roles.id`     |
| `tenant_id`   | `uuid`        | No       |         | Tenant owner         |
| `assigned_by` | `uuid`        | Yes      |         | User ID of assigner  |
| `assigned_at` | `timestamptz` | No       | `now()` | Assignment timestamp |

**Indexes**

- `IDX_156cd3e5710ec8c0a4bbe7865f` on (`tenant_id`)
- `IDX_23ed6f04fe43066df08379fd03` unique on (`user_id`, `role_id`)

**Constraints**

- PK: `"PK_23ed6f04fe43066df08379fd034"` on (`user_id`, `role_id`).

**Foreign Keys**

- `"FK_87b8888186ca9769c960e926870"`: `user_id` → `users.id` (CASCADE on delete).
- `"FK_b23c65e50a758245a33ee35fda1"`: `role_id` → `roles.id` (CASCADE on delete).

**RLS Policies**

- `user_roles_tenant_isolation`:
  - `USING ((SELECT tenant_id FROM users WHERE id = user_roles.user_id) = current_setting('app.tenant_id')::uuid)`.

---

#### `refresh_tokens`

| Column       | Type           | Nullable | Default              | Description                  |
| ------------ | -------------- | -------- | -------------------- | ---------------------------- |
| `id`         | `uuid`         | No       | `uuid_generate_v4()` | Primary key                  |
| `tenant_id`  | `uuid`         | No       |                      | Tenant owner                 |
| `user_id`    | `uuid`         | No       |                      | User ID                      |
| `token_hash` | `varchar(255)` | No       |                      | SHA256 hash of refresh token |
| `expires_at` | `timestamptz`  | No       |                      | Expiry timestamp             |
| `revoked_at` | `timestamptz`  | Yes      |                      | When token was revoked       |
| `created_at` | `timestamptz`  | No       | `now()`              | Creation timestamp           |

**Indexes**

- `IDX_5a8595644958acb2c80e175778` on (`tenant_id`)
- `IDX_3ddc983c5f7bcf132fd8732c3f` on (`user_id`)
- `IDX_a7838d2ba25be1342091b6695f` unique on (`token_hash`)

**Constraints**

- PK: `"PK_7d8bee0204106019488c4c50ffa"` on `id`.

**Foreign Keys**

- None explicitly in migration; logically `user_id` references `users.id`.

**RLS Policies**

- `refresh_tokens_tenant_isolation`:
  - `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.

---

#### `permissions`

| Column        | Type           | Nullable | Default              | Description                          |
| ------------- | -------------- | -------- | -------------------- | ------------------------------------ |
| `id`          | `uuid`         | No       | `uuid_generate_v4()` | Primary key                          |
| `resource`    | `varchar(100)` | No       |                      | Resource (e.g. `workflow_definition` |
| `action`      | `varchar(100)` | No       |                      | Action (`create`, `publish`, `read`) |
| `description` | `varchar(255)` | Yes      |                      | Human-readable description           |
| `createdAt`   | `timestamptz`  | No       | `now()`              | Creation timestamp                   |

**Indexes**

- None defined beyond PK.

**Constraints**

- PK: `"PK_920331560282b8bd21bb02290df"` on `id`.

**Foreign Keys**

- None; this table is global/system-wide.

**RLS Policies**

- None (explicitly skipped in RLS migration; global table).

---

### 2.2 Tenant Tables

#### `tenants`

| Column      | Type                                             | Nullable | Default              | Description               |
| ----------- | ------------------------------------------------ | -------- | -------------------- | ------------------------- |
| `id`        | `uuid`                                           | No       | `uuid_generate_v4()` | Primary key               |
| `name`      | `varchar(255)`                                   | No       |                      | Tenant name               |
| `slug`      | `varchar(100)`                                   | No       |                      | Unique slug               |
| `plan`      | `tenant_plan_enum` (`free`, `pro`, `enterprise`) | No       |                      | Subscription plan         |
| `isActive`  | `boolean`                                        | No       | `true`               | Active/deactivated status |
| `createdAt` | `timestamptz`                                    | No       | `now()`              | Creation time             |
| `updatedAt` | `timestamptz`                                    | No       | `now()`              | Last updated time         |

**Indexes**

- `UQ_2310ecc5cb8be427097154b18fc` unique on `slug`.

**Constraints**

- PK: `"PK_53be67a04681c66b87ee27c9321"` on `id`.

**Foreign Keys**

- Referenced by `tenant_settings.tenant_id`, `tenant_feature_flags.tenant_id`.

**RLS Policies**

- None (root entity; not tenant-scoped).

---

#### `tenant_settings`

| Column                   | Type          | Nullable | Default              | Description                          |
| ------------------------ | ------------- | -------- | -------------------- | ------------------------------------ |
| `id`                     | `uuid`        | No       | `uuid_generate_v4()` | Primary key                          |
| `tenant_id`              | `uuid`        | No       |                      | FK to `tenants.id`                   |
| `maxWorkflowDefinitions` | `integer`     | No       | `10`                 | Per-tenant workflow definition limit |
| `maxUsers`               | `integer`     | No       | `50`                 | Per-tenant user limit                |
| `branding`               | `jsonb`       | Yes      |                      | Branding configuration               |
| `timezone`               | `varchar(50)` | No       | `'UTC'`              | Tenant default timezone              |
| `updatedAt`              | `timestamptz` | No       | `now()`              | Last updated                         |

**Indexes**

- `IDX_a6abc1c3ed0df635955fc852f1` on (`tenant_id`)

**Constraints**

- PK: `"PK_69225c0ca64bcbbf9af8a217043"` on `id`.
- Unique: `"UQ_a6abc1c3ed0df635955fc852f1c"` / `"REL_a6abc1c3ed0df635955fc852f1"` ensure one row per tenant.
- FK: `"FK_a6abc1c3ed0df635955fc852f1c"`: `tenant_id` → `tenants.id`.

**RLS Policies**

- `tenant_settings_tenant_isolation`:
  - `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.

---

#### `tenant_feature_flags`

| Column       | Type           | Nullable | Default              | Description                    |
| ------------ | -------------- | -------- | -------------------- | ------------------------------ |
| `id`         | `uuid`         | No       | `uuid_generate_v4()` | Primary key                    |
| `tenant_id`  | `uuid`         | No       |                      | FK to `tenants.id`             |
| `created_at` | `timestamptz`  | No       | `now()`              | Created                        |
| `updated_at` | `timestamptz`  | No       | `now()`              | Updated                        |
| `flagKey`    | `varchar(100)` | No       |                      | Feature flag key               |
| `isEnabled`  | `boolean`      | No       | `false`              | Whether flag is enabled        |
| `config`     | `jsonb`        | Yes      |                      | Optional configuration payload |

**Indexes**

- `IDX_16a1f6c44ac76e14dd44d821fd` on (`tenant_id`)

**Constraints**

- PK: `"PK_662d67fb0742549eca25ce588ed"` on `id`.
- Unique: `"UQ_732a30e3f4ec0d554e1de500ad6"` on (`tenant_id`, `flagKey`).

**RLS Policies**

- `tenant_feature_flags_tenant_isolation`:
  - `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.

---

### 2.3 Workflow Definition Tables

#### `workflow_definitions`

| Column            | Type                               | Nullable | Default              | Description                        |
| ----------------- | ---------------------------------- | -------- | -------------------- | ---------------------------------- |
| `id`              | `uuid`                             | No       | `uuid_generate_v4()` | Primary key                        |
| `tenant_id`       | `uuid`                             | No       |                      | Tenant owner                       |
| `created_at`      | `timestamptz`                      | No       | `now()`              | Created                            |
| `updated_at`      | `timestamptz`                      | No       | `now()`              | Updated                            |
| `name`            | `varchar(255)`                     | No       |                      | Definition name                    |
| `description`     | `text`                             | Yes      |                      | Description                        |
| `current_version` | `integer`                          | No       | `1`                  | Latest published version number    |
| `status`          | `workflow_definitions_status_enum` | No       | `'draft'`            | `draft`, `published`, `deprecated` |
| `created_by`      | `uuid`                             | No       |                      | User who created the definition    |

**Indexes**

- `IDX_62bad1658c553173f580e8b813` on (`tenant_id`)

**Constraints**

- PK: `"PK_4f92fadfc5fb722f080ceaec272"` on `id`.

**Foreign Keys**

- None enforced in migration; logical references to `users.id` and join to other workflow tables by `id`.

**RLS Policies**

- `workflow_definitions_tenant_isolation`:
  - `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.

---

#### `workflow_definition_versions`

| Column                   | Type          | Nullable | Default              | Description                              |
| ------------------------ | ------------- | -------- | -------------------- | ---------------------------------------- |
| `id`                     | `uuid`        | No       | `uuid_generate_v4()` | Primary key                              |
| `tenant_id`              | `uuid`        | No       |                      | Tenant owner                             |
| `created_at`             | `timestamptz` | No       | `now()`              | Created                                  |
| `updated_at`             | `timestamptz` | No       | `now()`              | Updated                                  |
| `workflow_definition_id` | `uuid`        | No       |                      | Owning workflow definition ID            |
| `version_number`         | `integer`     | No       |                      | Version number                           |
| `snapshot`               | `jsonb`       | No       |                      | Immutable aggregate snapshot             |
| `is_active`              | `boolean`     | No       | `false`              | Whether this version is currently active |
| `published_by`           | `uuid`        | No       |                      | User who published this version          |
| `published_at`           | `timestamptz` | Yes      |                      | When published                           |

**Indexes**

- `IDX_dfd1ed71751f51e847325be65c` on (`tenant_id`)
- `IDX_d04275c2688d4002adfbbc1637` unique on (`workflow_definition_id`, `version_number`)

**Constraints**

- PK: `"PK_68c6710e79b6f60d1be76c0ba0b"` on `id`.

**Foreign Keys**

- Logical: `workflow_definition_id` → `workflow_definitions.id`.

**RLS Policies**

- `workflow_definition_versions_tenant_isolation`.

---

#### `workflow_states`

| Column                   | Type               | Nullable | Default              | Description                       |
| ------------------------ | ------------------ | -------- | -------------------- | --------------------------------- |
| `id`                     | `uuid`             | No       | `uuid_generate_v4()` | Primary key                       |
| `tenant_id`              | `uuid`             | No       |                      | Tenant owner                      |
| `created_at`             | `timestamptz`      | No       | `now()`              | Created                           |
| `updated_at`             | `timestamptz`      | No       | `now()`              | Updated                           |
| `workflow_definition_id` | `uuid`             | No       |                      | Owning definition                 |
| `name`                   | `varchar(100)`     | No       |                      | State name                        |
| `description`            | `text`             | Yes      |                      | Description                       |
| `is_initial`             | `boolean`          | No       | `false`              | Whether this is the initial state |
| `is_terminal`            | `boolean`          | No       | `false`              | Whether this is a terminal state  |
| `position_x`             | `double precision` | Yes      |                      | Design-time X coordinate          |
| `position_y`             | `double precision` | Yes      |                      | Design-time Y coordinate          |
| `metadata`               | `jsonb`            | Yes      |                      | Additional visual metadata        |

**Indexes**

- `IDX_96d9b66e0f793921955157dd7f` on (`tenant_id`)

**Constraints**

- PK: `"PK_d495dad7ebe116fb8f989f1e144"` on `id`.

**RLS Policies**

- `workflow_states_tenant_isolation`.

---

#### `workflow_transitions`

| Column                   | Type           | Nullable | Default              | Description                                          |
| ------------------------ | -------------- | -------- | -------------------- | ---------------------------------------------------- |
| `id`                     | `uuid`         | No       | `uuid_generate_v4()` | Primary key                                          |
| `tenant_id`              | `uuid`         | No       |                      | Tenant owner                                         |
| `created_at`             | `timestamptz`  | No       | `now()`              | Created                                              |
| `updated_at`             | `timestamptz`  | No       | `now()`              | Updated                                              |
| `workflow_definition_id` | `uuid`         | No       |                      | Definition owning this transition                    |
| `name`                   | `varchar(100)` | No       |                      | Transition name                                      |
| `from_state_id`          | `uuid`         | No       |                      | Source state ID                                      |
| `to_state_id`            | `uuid`         | No       |                      | Target state ID                                      |
| `allowed_role_ids`       | `uuid[]`       | No       | `'{}'`               | Allowed roles for this transition (empty = any role) |
| `requires_comment`       | `boolean`      | No       | `false`              | Whether a comment is required during execution       |

**Indexes**

- `IDX_2504c8b3ba4e07b13986fd7904` on (`tenant_id`)

**Constraints**

- PK: `"PK_edda0b5bb7b13fc6681c56764af"` on `id`.

**RLS Policies**

- `workflow_transitions_tenant_isolation`.

---

#### `transition_rules`

| Column             | Type           | Nullable | Default              | Description                   |
| ------------------ | -------------- | -------- | -------------------- | ----------------------------- |
| `id`               | `uuid`         | No       | `uuid_generate_v4()` | Primary key                   |
| `tenant_id`        | `uuid`         | No       |                      | Tenant owner                  |
| `created_at`       | `timestamptz`  | No       | `now()`              | Created                       |
| `updated_at`       | `timestamptz`  | No       | `now()`              | Updated                       |
| `transition_id`    | `uuid`         | No       |                      | Owning transition ID          |
| `rule_name`        | `varchar(100)` | No       |                      | Logical name for this rule    |
| `rule_definition`  | `jsonb`        | No       |                      | `json-rules-engine` AST       |
| `evaluation_order` | `integer`      | No       | `0`                  | Ordering among multiple rules |

**Indexes**

- `IDX_2ff285f33c1b023ba1e2799e6b` on (`tenant_id`)

**Constraints**

- PK: `"PK_0a45ca127cad0dfa43b1b2670fe"` on `id`.

**RLS Policies**

- `transition_rules_tenant_isolation`.

---

#### `instance_form_schemas`

| Column                   | Type          | Nullable | Default              | Description                       |
| ------------------------ | ------------- | -------- | -------------------- | --------------------------------- |
| `id`                     | `uuid`        | No       | `uuid_generate_v4()` | Primary key                       |
| `tenant_id`              | `uuid`        | No       |                      | Tenant owner                      |
| `created_at`             | `timestamptz` | No       | `now()`              | Created                           |
| `updated_at`             | `timestamptz` | No       | `now()`              | Updated                           |
| `workflow_definition_id` | `uuid`        | No       |                      | Definition this schema belongs to |
| `schema`                 | `jsonb`       | No       |                      | Form schema JSON                  |

**Indexes**

- `IDX_171f0512f2c0b39ef72c941a0d` on (`tenant_id`)
- `IDX_2d7c912f10ed86a3331a544e50` unique on (`workflow_definition_id`)

**Constraints**

- PK: `"PK_481cc5b264ca983411c3f7eab0e"` on `id`.

**RLS Policies**

- `instance_form_schemas_tenant_isolation`.

---

### 2.4 Workflow Execution Tables

#### `workflow_instances`

| Column                   | Type                             | Nullable | Default              | Description                        |
| ------------------------ | -------------------------------- | -------- | -------------------- | ---------------------------------- |
| `id`                     | `uuid`                           | No       | `uuid_generate_v4()` | Primary key                        |
| `tenant_id`              | `uuid`                           | No       |                      | Tenant owner                       |
| `created_at`             | `timestamptz`                    | No       | `now()`              | Created                            |
| `updated_at`             | `timestamptz`                    | No       | `now()`              | Updated                            |
| `workflow_definition_id` | `uuid`                           | No       |                      | Definition ID                      |
| `definition_version`     | `integer`                        | No       |                      | Version used for this instance     |
| `current_state_id`       | `uuid`                           | No       |                      | Current state ID                   |
| `current_state_name`     | `varchar(100)`                   | No       |                      | Current state name (denormalized)  |
| `payload`                | `jsonb`                          | No       | `'{}'`               | Instance payload                   |
| `status`                 | `workflow_instances_status_enum` | No       | `'active'`           | `active`, `completed`, `cancelled` |
| `version`                | `integer`                        | No       | `1`                  | Optimistic lock version counter    |
| `created_by`             | `uuid`                           | No       |                      | User who created instance          |
| `completed_at`           | `timestamptz`                    | Yes      |                      | When instance completed            |

**Indexes**

- `IDX_b1d9f2a0de1a1fe0e5a40a2e62` on (`tenant_id`)
- `IDX_315b3ee1334b0c8e4313dc502e` on (`tenant_id`, `workflow_definition_id`)
- `IDX_546667131c795ca3bf0e0d2393` on (`tenant_id`, `status`)

**Constraints**

- PK: `"PK_90cc94e44ff8b7b7869f50e4fc4"` on `id`.

**RLS Policies**

- `workflow_instances_tenant_isolation`.

---

#### `we_user_shadows`

| Column      | Type           | Nullable | Default | Description                  |
| ----------- | -------------- | -------- | ------- | ---------------------------- |
| `id`        | `uuid`         | No       |         | User ID (same as `users.id`) |
| `tenant_id` | `uuid`         | No       |         | Tenant owner                 |
| `email`     | `varchar(255)` | No       |         | Snapshot of user email       |
| `full_name` | `varchar(255)` | No       |         | Snapshot full name           |
| `roles`     | `varchar[]`    | No       | `'{}'`  | Snapshot roles               |
| `is_active` | `boolean`      | No       | `true`  | Snapshot active flag         |
| `synced_at` | `timestamptz`  | No       |         | Last synced timestamp        |

**Indexes**

- `IDX_fc9cd3dbae92e02c23d8912f67` on (`tenant_id`)

**Constraints**

- PK: `"PK_593b297350aae3122f4b68f5d17"` on `id`.

**RLS Policies**

- `we_user_shadows_tenant_isolation`.

---

### 2.5 Audit Tables

#### `audit_logs`

| Column            | Type                          | Nullable | Default              | Description                                               |
| ----------------- | ----------------------------- | -------- | -------------------- | --------------------------------------------------------- |
| `id`              | `uuid`                        | No       | `uuid_generate_v4()` | Primary key                                               |
| `tenant_id`       | `uuid`                        | No       |                      | Tenant owner                                              |
| `instance_id`     | `uuid`                        | Yes      |                      | WorkflowInstance ID (if applicable)                       |
| `actor_id`        | `uuid`                        | Yes      |                      | User ID (optional)                                        |
| `actor_email`     | `varchar(255)`                | Yes      |                      | Snapshot actor email                                      |
| `actor_role`      | `varchar(100)`                | Yes      |                      | Snapshot actor role                                       |
| `action_type`     | `audit_logs_action_type_enum` | No       |                      | Action type (instance_created, transition_executed, etc.) |
| `transition_id`   | `uuid`                        | Yes      |                      | Transition ID (if applicable)                             |
| `transition_name` | `varchar(100)`                | Yes      |                      | Snapshot transition name                                  |
| `from_state`      | `varchar(100)`                | Yes      |                      | Snapshot from-state                                       |
| `to_state`        | `varchar(100)`                | Yes      |                      | Snapshot to-state                                         |
| `comment`         | `text`                        | Yes      |                      | Audit comment                                             |
| `ip_address`      | `varchar(45)`                 | Yes      |                      | IP address of actor                                       |
| `user_agent`      | `text`                        | Yes      |                      | User agent                                                |
| `event_id`        | `uuid`                        | No       |                      | Unique event idempotency key                              |
| `resource_type`   | `varchar(100)`                | No       |                      | Resource type (e.g. `workflow_instance`)                  |
| `resource_id`     | `uuid`                        | No       |                      | Resource identifier                                       |
| `occurred_at`     | `timestamptz`                 | No       |                      | Time action occurred                                      |
| `payload`         | `jsonb`                       | Yes      |                      | Optional captured payload snapshot                        |
| `created_at`      | `timestamptz`                 | No       | `now()`              | Insertion time                                            |

**Indexes**

- `IDX_6f18d459490bb48923b1f40bdb` on (`tenant_id`)
- `IDX_68f97a33911429fff3232bd291` on (`instance_id`)
- `IDX_898d14750b88319b89b1ab66cd` on (`tenant_id`, `created_at`)
- `IDX_ef8394416891691cef1bb4c4e7` on (`tenant_id`, `instance_id`)

**Constraints**

- PK: `"PK_1bb179d048bbc581caa3b013439"` on `id`.
- Unique: `"UQ_a3d19b5d77683e3c133f298d751"` on `event_id`.

**RLS Policies**

- `audit_logs_tenant_isolation`.

---

### 2.6 Notification Tables

#### `notification_templates`

| Column             | Type                                  | Nullable | Default              | Description                              |
| ------------------ | ------------------------------------- | -------- | -------------------- | ---------------------------------------- |
| `id`               | `uuid`                                | No       | `uuid_generate_v4()` | Primary key                              |
| `tenant_id`        | `uuid`                                | No       |                      | Tenant owner                             |
| `created_at`       | `timestamptz`                         | No       | `now()`              | Created                                  |
| `updated_at`       | `timestamptz`                         | No       | `now()`              | Updated                                  |
| `event_trigger`    | `varchar(100)`                        | No       |                      | Event key (e.g. `workflow.transition.*`) |
| `channel`          | `notification_templates_channel_enum` | No       |                      | `email` or `webhook`                     |
| `subject_template` | `text`                                | Yes      |                      | Email subject template                   |
| `body_template`    | `text`                                | No       |                      | Body template (e.g. Handlebars)          |
| `is_active`        | `boolean`                             | No       | `true`               | Enabled flag                             |

**Indexes**

- `IDX_e5a9758b51fe8568e19eea9673` on (`tenant_id`)

**Constraints**

- PK: `"PK_76f0fc48b8d057d2ae7f3a2848a"` on `id`.

**RLS Policies**

- `notification_templates_tenant_isolation`.

---

#### `notification_logs`

| Column              | Type                             | Nullable | Default              | Description                             |
| ------------------- | -------------------------------- | -------- | -------------------- | --------------------------------------- |
| `id`                | `uuid`                           | No       | `uuid_generate_v4()` | Primary key                             |
| `tenant_id`         | `uuid`                           | No       |                      | Tenant owner                            |
| `template_id`       | `uuid`                           | No       |                      | FK to `notification_templates.id`       |
| `recipient_user_id` | `uuid`                           | Yes      |                      | Optional recipient user ID              |
| `recipient_email`   | `varchar(255)`                   | No       |                      | Recipient email                         |
| `channel`           | `notification_logs_channel_enum` | No       |                      | `email` or `webhook`                    |
| `status`            | `notification_logs_status_enum`  | No       | `'pending'`          | `pending`, `sent`, `failed`             |
| `retry_count`       | `integer`                        | No       | `0`                  | Number of retries                       |
| `error_message`     | `text`                           | Yes      |                      | Error message (if failed)               |
| `sent_at`           | `timestamptz`                    | Yes      |                      | When notification was successfully sent |
| `created_at`        | `timestamptz`                    | No       | `now()`              | Created                                 |

**Indexes**

- `IDX_fe6690289c5e319b2ac0d809d7` on (`tenant_id`)

**Constraints**

- PK: `"PK_19c524e644cdeaebfcffc284871"` on `id`.

**RLS Policies**

- `notification_logs_tenant_isolation`.

---

#### `webhook_configs`

| Column           | Type           | Nullable | Default              | Description                    |
| ---------------- | -------------- | -------- | -------------------- | ------------------------------ |
| `id`             | `uuid`         | No       | `uuid_generate_v4()` | Primary key                    |
| `tenant_id`      | `uuid`         | No       |                      | Tenant owner                   |
| `created_at`     | `timestamptz`  | No       | `now()`              | Created                        |
| `updated_at`     | `timestamptz`  | No       | `now()`              | Updated                        |
| `name`           | `varchar(100)` | No       |                      | Webhook name                   |
| `url`            | `text`         | No       |                      | Webhook endpoint URL           |
| `secret`         | `varchar(255)` | No       |                      | Shared secret for HMAC signing |
| `event_triggers` | `varchar[]`    | No       |                      | List of events to subscribe to |
| `is_active`      | `boolean`      | No       | `true`               | Enabled flag                   |

**Indexes**

- `IDX_9c3f75953455671406b1eca079` on (`tenant_id`)

**Constraints**

- PK: `"PK_b6d2d3606e01c28d476122185b6"` on `id`.

**RLS Policies**

- `webhook_configs_tenant_isolation`.

---

#### `webhook_delivery_logs`

| Column              | Type           | Nullable | Default              | Description                |
| ------------------- | -------------- | -------- | -------------------- | -------------------------- |
| `id`                | `uuid`         | No       | `uuid_generate_v4()` | Primary key                |
| `tenant_id`         | `uuid`         | No       |                      | Tenant owner               |
| `webhook_config_id` | `uuid`         | No       |                      | FK to `webhook_configs.id` |
| `event_name`        | `varchar(100)` | No       |                      | Event name                 |
| `payload`           | `jsonb`        | No       |                      | Delivered payload          |
| `http_status`       | `integer`      | Yes      |                      | HTTP status from endpoint  |
| `response_body`     | `text`         | Yes      |                      | Response body              |
| `attempt_number`    | `integer`      | No       | `1`                  | Delivery attempt number    |
| `delivered_at`      | `timestamptz`  | Yes      |                      | Successful delivery time   |
| `created_at`        | `timestamptz`  | No       | `now()`              | Created                    |

**Indexes**

- `IDX_621e74008288050a6c8112d972` on (`tenant_id`)

**Constraints**

- PK: `"PK_0e3b1d3f1b9b79d4a7ad0b92b84"` on `id`.

**RLS Policies**

- `webhook_delivery_logs_tenant_isolation`.

---

## 3. Entity Relationship Overview

![ERD](./images/ERD.png)

### 3.1 Core Entity Groups

- **Auth:**
  - `users` ←→ `user_roles` ←→ `roles`
  - `refresh_tokens`, `permissions`

- **Tenant:**
  - `tenants` ←→ `tenant_settings`
  - `tenants` ←→ `tenant_feature_flags`

- **Workflow Definition:**
  - `workflow_definitions` → `workflow_definition_versions` (snapshot versions)
  - `workflow_definitions` → `workflow_states`
  - `workflow_definitions` → `workflow_transitions`
  - `workflow_transitions` → `transition_rules`
  - `workflow_definitions` → `instance_form_schemas`

- **Workflow Execution:**
  - `workflow_instances` (runtime instances)
  - `we_user_shadows` (denormalized auth user data for joins)

- **Audit:**
  - `audit_logs` (event log)

- **Notification:**
  - `notification_templates`, `notification_logs`
  - `webhook_configs`, `webhook_delivery_logs`

### 3.2 Cross-Context Relationships

Cross-context relationships are expressed purely as foreign-key-like UUIDs:

- `workflow_instances.workflow_definition_id` ↔ `workflow_definitions.id`
- `workflow_instances.tenant_id` ↔ `tenants.id`
- `audit_logs.instance_id` ↔ `workflow_instances.id`
- `notification_logs.template_id` ↔ `notification_templates.id`
- `webhook_delivery_logs.webhook_config_id` ↔ `webhook_configs.id`

No ORM relationships are defined across modules; all navigation is done via repositories, contracts, or event-driven shadows, in line with the schema design philosophy.

---

## 4. Row-Level Security (RLS)

### 4.1 RLS Strategy Overview

The RLS strategy is fully described in `RLS_IMPLEMENTATION_STRATEGY.md`. The content is included here verbatim.

````markdown
# Row-Level Security (RLS) Implementation Strategy

## 🎯 **Overview**

This document outlines the complete Row-Level Security (RLS) implementation for our multi-tenant workflow engine application. RLS provides database-level tenant isolation that automatically filters data based on tenant context, ensuring security even when application code has bugs or omissions.

## 🏗️ **Architecture Components**

### **1. Database Migration**

- **File**: [`src/modules/database/migrations/016_create_rls_policies.ts`](src/modules/database/migrations/016_create_rls_policies.ts)
- **Purpose**: Creates RLS policies for all tenant-scoped tables
- **Coverage**: 20+ tables across Auth, Tenant, Workflow, Audit, and Notification modules

### **2. RLS Context Service**

- **File**: [`src/modules/database/services/rls-context.service.ts`](src/modules/database/services/rls-context.service.ts)
- **Purpose**: Manages PostgreSQL session context for RLS policies
- **Key Methods**:
  - `setTenantContext(tenantId)`: Sets PostgreSQL session variable
  - `clearTenantContext()`: Clears tenant context (fail-secure)
  - `getCurrentTenantContext()`: Gets current tenant context
  - `withTenantContext()`: Executes function with specific tenant context
  - `bypassRls()`: Admin operations that need cross-tenant access

### **3. Database Context Interceptor**

- **File**: [`src/modules/database/interceptors/database-context.interceptor.ts`](src/modules/database/interceptors/database-context.interceptor.ts)
- **Purpose**: Global interceptor that sets tenant context before database queries
- **Execution**: Runs after JWT authentication, before any database operations

### **4. Integration Points**

- **Database Module**: [`src/modules/database/database.module.ts`](src/modules/database/database.module.ts)
- **App Module**: [`src/app.module.ts`](src/app.module.ts) - Global interceptor registration

## 🔄 **Request Flow**

### **Step-by-Step Execution**

1. HTTP Request → 2. Guards → 3. Interceptors → 4. Controller → 5. Service → 6. Repository → 7. Database

#### **1. HTTP Request**

```http
GET /api/users/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
````

#### **2. Security Guards Pipeline**

```typescript
// Execution order in app.module.ts
1. ThrottlerGuard        // Rate limiting
2. JwtAuthGuard         // Validates JWT, populates req.user
3. TenantIsolationGuard // Validates tenant access
4. RolesGuard          // Validates user permissions
```

After `JwtAuthGuard`:

```typescript
req.user = {
  userId: "123e4567-e89b-12d3-a456-426614174000",
  tenantId: "550e8400-e29b-41d4-a716-446655440000", // ← Critical for RLS
  email: "user@tenant1.com",
  roles: ["user"],
};
```

#### **3. Interceptor Pipeline**

```typescript
// Execution order in app.module.ts
1. ClassSerializerInterceptor
2. LoggingInterceptor
3. TenantContextInterceptor      // Sets req.tenantId
4. DatabaseContextInterceptor    // ← Sets PostgreSQL context
```

#### **4. DatabaseContextInterceptor Execution**

```typescript
// Extract tenant ID from JWT
const tenantId = request.user?.tenantId;

if (tenantId) {
  // Set PostgreSQL session context
  await this.rlsContextService.setTenantContext(tenantId);
  // Executes: SELECT set_config('app.tenant_id', tenantId, false)
}
```

#### **5. Controller & Service**

```typescript
// In UserController
@Get('/profile')
async getProfile(@CurrentUser() user: IJwtPayload) {
  return this.userService.findById(user.userId); // No tenantId needed!
}

// In UserService
async findById(userId: string): Promise<User> {
  // Simple query - RLS handles tenant filtering
  return this.userRepository.findOne({ where: { id: userId } });
}
```

#### **6. Database Magic**

```sql
-- Developer writes:
SELECT * FROM users WHERE id = '123e4567-e89b-12d3-a456-426614174000';

-- PostgreSQL RLS automatically transforms to:
SELECT * FROM users
WHERE id = '123e4567-e89b-12d3-a456-426614174000'
  AND tenant_id = (current_setting('app.tenant_id'))::uuid;
```

## 🛡️ **Security Scenarios**

### **Scenario A: Normal Operation**

```typescript
// User from Tenant A accesses their profile
// JWT: tenantId = "tenant-a-uuid"
// RLS context: "tenant-a-uuid"
// Query: SELECT * FROM users WHERE id = 'user-123'
// RLS adds: AND tenant_id = 'tenant-a-uuid'
// Result: ✅ Returns user data (if user belongs to tenant A)
```

### **Scenario B: Malicious Attempt**

```typescript
// Attacker tries to access different tenant's data
// JWT: tenantId = "tenant-a-uuid"
// RLS context: "tenant-a-uuid"
// Malicious query: SELECT * FROM users WHERE id = 'user-from-tenant-b'
// RLS adds: AND tenant_id = 'tenant-a-uuid'
// Result: ❌ No data returned (user-from-tenant-b belongs to different tenant)
```

### **Scenario C: Developer Mistake**

```typescript
// Developer forgets tenant filtering
async getAllUsers() {
  return this.userRepository.find(); // Dangerous - no tenant filter!
}

// RLS saves the day:
// Actual execution: SELECT * FROM users WHERE tenant_id = 'current-tenant-uuid'
// Result: ✅ Only returns users from current tenant
```

### **Scenario D: SQL Injection**

```typescript
// Even if SQL injection bypasses application layer:
// Malicious input: "'; DROP TABLE users; --"
// RLS policies CANNOT be bypassed by SQL injection
// Result: ❌ Attack fails, data remains secure
```

## 🔧 **Manual tenantId Filtering + RLS**

### **Case 1: Correct tenantId (Matches RLS Context)**

```typescript
async findById(userId: string, tenantId: string): Promise<User> {
  return this.userRepository.findOne({
    where: { id: userId, tenantId: tenantId }
  });
}
```

**Database execution:**

```sql
-- Manual + RLS filtering:
SELECT * FROM users
WHERE id = '123e4567-e89b-12d3-a456-426614174000'
  AND tenant_id = '550e8400-e29b-41d4-a716-446655440000'  -- Manual
  AND tenant_id = (current_setting('app.tenant_id'))::uuid; -- RLS

-- Result: ✅ Works fine (redundant but safe)
```

### **Case 2: Wrong tenantId (Security Violation)**

```typescript
async findById(userId: string, tenantId: string): Promise<User> {
  return this.userRepository.findOne({
    where: { id: userId, tenantId: "different-tenant-uuid" }
  });
}
```

**Database execution:**

```sql
-- Creates impossible condition:
SELECT * FROM users
WHERE id = '123e4567-e89b-12d3-a456-426614174000'
  AND tenant_id = 'different-tenant-uuid'     -- Manual (wrong)
  AND tenant_id = 'correct-tenant-uuid';      -- RLS (correct)

-- Result: ❌ No data returned (RLS prevents data leak)
```

## 📋 **Implementation Patterns**

### **Pattern 1: Pure RLS (Recommended)**

```typescript
// Clean, simple, RLS-protected
async findById(userId: string): Promise<User> {
  return this.userRepository.findOne({ where: { id: userId } });
  // RLS automatically adds: AND tenant_id = current_tenant
}

// Benefits:
// ✅ Cleaner code
// ✅ Fewer parameters
// ✅ Better performance
// ✅ Less maintenance
```

### **Pattern 2: Hybrid Approach (Extra Paranoid)**

```typescript
// Manual + RLS for extra validation
async findById(userId: string, tenantId: string): Promise<User> {
  // Validate tenantId matches RLS context
  const currentContext = await this.rlsContextService.getCurrentTenantContext();
  if (tenantId !== currentContext) {
    throw new ForbiddenException('Tenant context mismatch');
  }

  return this.userRepository.findOne({
    where: { id: userId, tenantId }
  });
}

// Benefits:
// ✅ Defense in depth
// ✅ Explicit validation
// ⚠️ More complex code
// ⚠️ Performance overhead
```

### **Pattern 3: Admin Operations**

```typescript
// Cross-tenant access for admin operations
async getAllTenantsUsers(): Promise<User[]> {
  return this.rlsContextService.bypassRls(async () => {
    return this.userRepository.find(); // Returns users from ALL tenants
  });
}

// Specific tenant access
async getUsersFromTenant(targetTenantId: string): Promise<User[]> {
  return this.rlsContextService.withTenantContext(targetTenantId, async () => {
    return this.userRepository.find(); // Returns users from target tenant
  });
}
```

## 🚀 **Protected Tables**

RLS policies are applied to all tenant-scoped tables:

### **Auth Module**

- `users`, `roles`, `user_roles`, `role_permissions`, `refresh_tokens`

### **Tenant Module**

- `tenant_settings`, `tenant_feature_flags`

### **Workflow Definition Module**

- `workflow_definitions`, `workflow_definition_versions`, `workflow_states`
- `workflow_transitions`, `transition_rules`, `instance_form_schemas`

### **Workflow Execution Module**

- `workflow_instances`, `we_user_shadows`

### **Audit Module**

- `audit_logs`

### **Notification Module**

- `notification_templates`, `notification_logs`, `webhook_configs`, `webhook_delivery_logs`

### **Rule Engine Module**

- `rule_templates`

**Note**: The `tenants` table has NO RLS (it IS the root entity).

## ⚡ **Performance Considerations**

### **Query Performance**

- RLS policies use indexed `tenant_id` columns
- PostgreSQL query planner optimizes RLS conditions
- Minimal performance impact for properly indexed tables

### **Connection Pooling**

- Context is cleared after each request
- Safe for connection reuse across different tenants
- No connection state pollution

### **Monitoring**

```typescript
// Enable RLS logging in development
const isDev = configService.get<string>("NODE_ENV") === "development";
// Logs all RLS policy evaluations for debugging
```

## 🔍 **Testing Strategy**

### **Unit Tests**

- Mock `RlsContextService` for service layer tests
- Test both with and without tenant context
- Verify error handling for missing context

### **Integration Tests**

- Test actual database queries with RLS enabled
- Verify tenant isolation across different scenarios
- Test admin bypass functionality

### **Security Tests**

- Attempt cross-tenant data access
- SQL injection attempts
- Context manipulation attempts

## 🚨 **Security Best Practices**

### **1. Fail-Secure Default**

```sql
-- FORCE ROW LEVEL SECURITY ensures:
-- If no context is set, ALL access is denied
ALTER TABLE users FORCE ROW LEVEL SECURITY;
```

### **2. Context Validation**

```typescript
// Always validate tenant context before sensitive operations
await this.rlsContextService.validateTenantContext();
```

### **3. Audit Logging**

```typescript
// Log all RLS context changes
this.logger.debug(`RLS context set: tenant_id = ${tenantId}`);
```

### **4. Admin Operations**

```typescript
// Explicit logging for RLS bypass
this.logger.warn("RLS bypass requested - ensure this is authorized");
```

## 🎯 **Key Benefits**

1. **Zero Code Changes**: Existing queries automatically become tenant-safe
2. **Fail-Safe Security**: If context isn't set, RLS denies ALL access
3. **SQL Injection Protection**: Even malicious SQL can't bypass tenant boundaries
4. **Developer-Friendly**: No need to remember tenant filtering in every query
5. **Audit-Ready**: All queries are automatically tenant-scoped at database level
6. **Performance**: Minimal overhead with proper indexing
7. **Maintainable**: Centralized security logic, less code to maintain

## 🔧 **Troubleshooting**

### **Common Issues**

#### **No Data Returned**

```typescript
// Check if tenant context is set
const context = await this.rlsContextService.getCurrentTenantContext();
console.log("Current tenant context:", context);
```

#### **Context Not Set**

```typescript
// Ensure DatabaseContextInterceptor is registered globally
// Check JWT payload contains tenantId
// Verify interceptor execution order
```

#### **Performance Issues**

```sql
-- Ensure tenant_id columns are indexed
CREATE INDEX CONCURRENTLY idx_users_tenant_id ON users(tenant_id);
```

## 📚 **References**

- [PostgreSQL Row Level Security Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [TypeORM Documentation](https://typeorm.io/)
- [NestJS Interceptors](https://docs.nestjs.com/interceptors)

---

### 10.4 Database Design

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

### 10.5 Tenancy Models Available and Recommendation

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

### 4.2 Tenant Isolation via RLS

- All tenant-scoped tables include a `tenant_id` column.
- On each request:
  - JWT guard populates `req.user.tenantId`.
  - `TenantContextInterceptor` sets `req.tenantId`.
  - `DatabaseContextInterceptor` calls `set_config('app.tenant_id', tenantId, false)`.
- RLS policies enforce `tenant_id = current_setting('app.tenant_id')::uuid`.
- Admin operations that need cross-tenant access use `RlsContextService.bypassRls` or `withTenantContext`.

### 4.3 RLS Policy Catalogue

| Policy Name                                     | Table                          | Rule Expression                                                                                        | Effect                                      |
| ----------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `users_tenant_isolation`                        | `users`                        | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits user rows to current tenant          |
| `roles_tenant_isolation`                        | `roles`                        | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits roles to current tenant              |
| `user_roles_tenant_isolation`                   | `user_roles`                   | `(SELECT tenant_id FROM users WHERE id = user_roles.user_id) = current_setting('app.tenant_id')::uuid` | Ensures join rows match user’s tenant       |
| `refresh_tokens_tenant_isolation`               | `refresh_tokens`               | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits refresh tokens to current tenant     |
| `tenant_settings_tenant_isolation`              | `tenant_settings`              | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits settings to current tenant           |
| `tenant_feature_flags_tenant_isolation`         | `tenant_feature_flags`         | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits flags to current tenant              |
| `workflow_definitions_tenant_isolation`         | `workflow_definitions`         | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits definitions to current tenant        |
| `workflow_definition_versions_tenant_isolation` | `workflow_definition_versions` | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits versions to current tenant           |
| `workflow_states_tenant_isolation`              | `workflow_states`              | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits states to current tenant             |
| `workflow_transitions_tenant_isolation`         | `workflow_transitions`         | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits transitions to current tenant        |
| `transition_rules_tenant_isolation`             | `transition_rules`             | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits rules to current tenant              |
| `instance_form_schemas_tenant_isolation`        | `instance_form_schemas`        | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits form schemas to current tenant       |
| `workflow_instances_tenant_isolation`           | `workflow_instances`           | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits instances to current tenant          |
| `we_user_shadows_tenant_isolation`              | `we_user_shadows`              | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits shadow entries to current tenant     |
| `audit_logs_tenant_isolation`                   | `audit_logs`                   | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits audit logs to current tenant         |
| `notification_templates_tenant_isolation`       | `notification_templates`       | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits templates to current tenant          |
| `notification_logs_tenant_isolation`            | `notification_logs`            | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits logs to current tenant               |
| `webhook_configs_tenant_isolation`              | `webhook_configs`              | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits webhook configs to current tenant    |
| `webhook_delivery_logs_tenant_isolation`        | `webhook_delivery_logs`        | `tenant_id = current_setting('app.tenant_id')::uuid`                                                   | Limits webhook deliveries to current tenant |

All these tables also have `FORCE ROW LEVEL SECURITY` set, which denies access when context is missing.

### 4.4 RLS Testing Strategy

- **Unit tests:**
  - Mock `RlsContextService` and ensure repositories behave correctly with and without context.
  - Validate that `TenantService.verifyUserBelongsToTenant` is enforced for admin updates.

- **Integration tests:**
  - Run migrations against a test database with RLS enabled.
  - Use different simulated JWT payloads to verify:
    - cross-tenant access is impossible,
    - admin bypass functions work correctly when using `bypassRls` or `withTenantContext`.

- **Security tests:**
  - Attempt deliberate cross-tenant queries with crafted IDs.
  - Inject SQL into input parameters and confirm RLS still prevents leakage.

---

## 5. Migration Strategy

### 5.1 Migration Tool & Convention

- **Tool:** TypeORM migrations driven via `npm run typeorm` and `migration-runner.ts`.
- **DataSource:** `database/data-source.ts` (referenced in prompts as `src/modules/database/ormconfig.ts`) configures:
  - `type: "postgres"`,
  - `url: process.env.DATABASE_URL`,
  - entities and migrations globs.
- **Execution:**
  - In CI or on startup, `runMigrations(dataSource)`:
    - initializes the DataSource,
    - applies any pending migrations,
    - logs applied migration names.

### 5.2 Migration File Catalogue

Current migrations in `src/modules/database/migrations`:

| Filename                               | Date / Order                     | Description                                                                | Tables Affected                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | -------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1772830603496-Migration.ts`           | Prefix timestamp `1772830603496` | Initial schema migration creating all core tables and enums                | `workflow_instances`, `we_user_shadows`, `workflow_transitions`, `workflow_states`, `workflow_definitions`, `workflow_definition_versions`, `transition_rules`, `instance_form_schemas`, `tenants`, `tenant_settings`, `tenant_feature_flags`, `webhook_delivery_logs`, `webhook_configs`, `notification_templates`, `notification_logs`, `roles`, `user_roles`, `users`, `refresh_tokens`, `permissions`, `audit_logs` |
| `1772830604496-Create-RLS-Policies.ts` | Prefix timestamp `1772830604496` | Enables RLS and adds tenant isolation policies to all tenant-scoped tables | RLS policies and `FORCE ROW LEVEL SECURITY` on all tenant-scoped tables listed above                                                                                                                                                                                                                                                                                                                                    |

> **[ASSUMPTION]** The numeric prefixes are derived from timestamps and indicate creation order rather than calendar-friendly names; future migrations should follow a timestamp-based naming convention to ensure sort order is meaningful.

### 5.3 Zero-Downtime Migration Patterns Used

In this initial version:

- Migrations are designed to be **additive**:
  - create tables, types, and indexes,
  - then enable RLS without dropping or altering existing columns in incompatible ways.

- For future zero-downtime changes:
  - use **expand-and-contract**:
    - add new nullable columns or tables first,
    - backfill data,
    - cut over application logic,
    - finally remove old columns.
  - avoid long-running blocking operations (e.g. large table rewrites) during peak load; instead:
    - create indexes concurrently where possible,
    - partition large tables (e.g. `audit_logs`, `workflow_instances`) by time and/or tenant.

---

## 6. Indexing Strategy

### 6.1 Index Catalogue

Key indexes created in `1772830603496-Migration.ts`:

| Index Name                       | Table                          | Columns                                    | Type            | Purpose                                                 |
| -------------------------------- | ------------------------------ | ------------------------------------------ | --------------- | ------------------------------------------------------- |
| `IDX_b1d9f2a0de1a1fe0e5a40a2e62` | `workflow_instances`           | `tenant_id`                                | B-tree          | Tenant-scoped lookups of instances                      |
| `IDX_315b3ee1334b0c8e4313dc502e` | `workflow_instances`           | `tenant_id`, `workflow_definition_id`      | B-tree          | Filtering instances by definition in tenant dashboards  |
| `IDX_546667131c795ca3bf0e0d2393` | `workflow_instances`           | `tenant_id`, `status`                      | B-tree          | Querying active/completed instances per tenant          |
| `IDX_fc9cd3dbae92e02c23d8912f67` | `we_user_shadows`              | `tenant_id`                                | B-tree          | Joining shadows by tenant                               |
| `IDX_2504c8b3ba4e07b13986fd7904` | `workflow_transitions`         | `tenant_id`                                | B-tree          | Tenant-scoped transitions listing                       |
| `IDX_96d9b66e0f793921955157dd7f` | `workflow_states`              | `tenant_id`                                | B-tree          | Tenant-scoped states listing                            |
| `IDX_62bad1658c553173f580e8b813` | `workflow_definitions`         | `tenant_id`                                | B-tree          | Fast definition listing per tenant                      |
| `IDX_dfd1ed71751f51e847325be65c` | `workflow_definition_versions` | `tenant_id`                                | B-tree          | Tenant-scoped version listing                           |
| `IDX_d04275c2688d4002adfbbc1637` | `workflow_definition_versions` | `workflow_definition_id`, `version_number` | B-tree (unique) | Fast lookup of version by definition and version number |
| `IDX_2ff285f33c1b023ba1e2799e6b` | `transition_rules`             | `tenant_id`                                | B-tree          | Tenant-scoped rules listing                             |
| `IDX_171f0512f2c0b39ef72c941a0d` | `instance_form_schemas`        | `tenant_id`                                | B-tree          | Tenant-scoped form schema listing                       |
| `IDX_2d7c912f10ed86a3331a544e50` | `instance_form_schemas`        | `workflow_definition_id`                   | B-tree (unique) | Enforces one schema per definition                      |
| `IDX_a6abc1c3ed0df635955fc852f1` | `tenant_settings`              | `tenant_id`                                | B-tree          | Tenant → settings lookups                               |
| `IDX_16a1f6c44ac76e14dd44d821fd` | `tenant_feature_flags`         | `tenant_id`                                | B-tree          | Tenant → flags enumeration                              |
| `IDX_621e74008288050a6c8112d972` | `webhook_delivery_logs`        | `tenant_id`                                | B-tree          | Tenant-scoped webhook log queries                       |
| `IDX_9c3f75953455671406b1eca079` | `webhook_configs`              | `tenant_id`                                | B-tree          | Tenant-scoped webhook configs                           |
| `IDX_e5a9758b51fe8568e19eea9673` | `notification_templates`       | `tenant_id`                                | B-tree          | Tenant-scoped template listing                          |
| `IDX_fe6690289c5e319b2ac0d809d7` | `notification_logs`            | `tenant_id`                                | B-tree          | Tenant-scoped notification log queries                  |
| `IDX_e59a01f4fe46ebbece575d9a0f` | `roles`                        | `tenant_id`                                | B-tree          | Tenant roles listing                                    |
| `IDX_c555146b304b5f51a7de6e18de` | `roles`                        | `tenant_id`, `name`                        | B-tree (unique) | Enforces role-name uniqueness per tenant                |
| `IDX_156cd3e5710ec8c0a4bbe7865f` | `user_roles`                   | `tenant_id`                                | B-tree          | Tenant user-role associations                           |
| `IDX_23ed6f04fe43066df08379fd03` | `user_roles`                   | `user_id`, `role_id`                       | B-tree (unique) | Prevents duplicate assignments                          |
| `IDX_109638590074998bb72a2f2cf0` | `users`                        | `tenant_id`                                | B-tree          | Tenant-scoped user listing                              |
| `IDX_e9f4c2efab52114c4e99e28efb` | `users`                        | `tenant_id`, `email`                       | B-tree (unique) | Enforces unique emails per tenant                       |
| `IDX_5a8595644958acb2c80e175778` | `refresh_tokens`               | `tenant_id`                                | B-tree          | Tenant-scoped refresh token queries                     |
| `IDX_3ddc983c5f7bcf132fd8732c3f` | `refresh_tokens`               | `user_id`                                  | B-tree          | User → tokens lookups                                   |
| `IDX_a7838d2ba25be1342091b6695f` | `refresh_tokens`               | `token_hash`                               | B-tree (unique) | Fast hashed token lookup                                |
| `IDX_6f18d459490bb48923b1f40bdb` | `audit_logs`                   | `tenant_id`                                | B-tree          | Tenant-level audit queries                              |
| `IDX_68f97a33911429fff3232bd291` | `audit_logs`                   | `instance_id`                              | B-tree          | Instance-level audit history                            |
| `IDX_898d14750b88319b89b1ab66cd` | `audit_logs`                   | `tenant_id`, `created_at`                  | B-tree          | Time-ordered tenant audit searches                      |
| `IDX_ef8394416891691cef1bb4c4e7` | `audit_logs`                   | `tenant_id`, `instance_id`                 | B-tree          | Tenant + instance queries                               |

### 6.2 Indexing Decision Framework

- **Always indexed:**
  - `tenant_id` on tenant-scoped tables to support RLS and multi-tenant queries.
  - Composite indexes on (`tenant_id`, `status`), (`tenant_id`, `workflow_definition_id`), etc., for common dashboard filters.

- **Uniqueness:**
  - Composite unique constraints on (`tenant_id`, `email`), (`tenant_id`, `name`), etc., enforce business invariants.

- **RLS alignment:**
  - Since RLS implicitly adds `tenant_id = current_setting(...)`, indexes on `tenant_id` are critical to keep RLS overhead low.

- **Future expansions:**
  - Per-tenant or per-time partitioning for large tables like `audit_logs` and `workflow_instances`.
  - Secondary indexes on JSONB fields if certain query patterns warrant it (e.g. searching on payload fields).

---

## 7. Concurrency Control

### 7.1 Optimistic vs Pessimistic Locking Decisions

- **Optimistic locking** is used for workflow instance transitions:
  - `workflow_instances.version` is incremented on each successful transition.
  - When executing a transition, the WHERE clause includes `version = :lastKnownVersion`.
  - If zero rows are updated, a `409 Conflict` is thrown (transition conflict).

- **Pessimistic locking** is intentionally avoided:
  - Pessimistic locks can create contention and deadlocks in a multi-tenant, high-traffic environment.
  - The engine favors optimistic concurrency with clear client-facing conflict responses.

### 7.2 Version Columns / Timestamps

- `workflow_instances.version`:
  - Implements transition concurrency control.
  - Combined with audit logs, it guarantees no double-approve scenarios.

- `created_at` / `updated_at`:
  - Present on almost all tenant-scoped tables.
  - Used for:
    - ordering results (e.g. audit history),
    - determining data retention windows,
    - debugging.

- `audit_logs`:
  - Has `created_at` and `occurred_at`, but **no `updated_at`**; rows are immutable by design.

---

## 8. Data Retention & Soft Delete Strategy

- **Soft deletes vs hard deletes:**
  - `users.is_active` and `tenants.isActive` are soft-delete flags.
  - Workflow instances are not soft-deleted; they move between `active`, `completed`, and `cancelled`.
  - Audit logs are **never deleted or updated**; immutability is enforced conceptually (and via a future trigger migration).

- **Retention:**
  - Audit logs and workflow instances are candidates for long-term retention policies:
    - partitioning by time,
    - archiving old partitions to cheaper storage (e.g. S3 snapshots via managed backups).

- **Compliance:**
  - Tenant-level retention controls are enforced primarily at application and configuration layers, using the audit and tenant settings tables as inputs.

---

## 9. Backup & Recovery Strategy (Conceptual)

Aligned with the non-functional requirements:

- **Backups:**
  - PostgreSQL Write-Ahead Logging (WAL) with continuous archiving.
  - Daily snapshots to S3-compatible storage.
  - Point-in-time recovery enabled for production.

- **Recovery objectives:**
  - Typical targets:
    - RPO: 5–15 minutes (based on WAL archiving intervals).
    - RTO: 30–60 minutes (based on restore and failover processes).

- **Multi-AZ deployment:**
  - Primary and standby in different availability zones.
  - Automatic failover in case of primary failure.

- **Disaster scenarios:**
  - AZ outage: failover to the standby in different AZ.
  - Region outage: restore from snapshots + WAL in another region.

---

## 10. Performance Tuning Notes

### 10.1 Query Optimization Patterns

- **Tenant-scoped queries:**
  - Always include `tenant_id` in WHERE clauses (even though RLS adds it implicitly).
  - Benefit from `tenant_id` and composite indexes for efficient scans.

- **CQRS separation:**
  - Execution module:
    - write-heavy operations (commands) optimized around small, transactional updates.
  - Read paths:
    - use query handlers and dedicated repositories,
    - may use read replicas in the future.

- **Shadow tables:**
  - `we_user_shadows` avoids expensive cross-module joins by maintaining denormalized user data in the execution context.

- **Pagination:**
  - APIs use `page` and `limit` DTOs; repository methods use OFFSET/LIMIT with indexed ordering for efficient pagination.

### 10.2 Connection Pooling

- **TypeORM pooling:**
  - Underlying `pg` driver manages connection pools per app instance.
  - RLS context is set per-connection via `SET_CONFIG`, then cleared/destroyed after requests.

- **Scaling:**
  - For higher loads:
    - run more application instances,
    - use PgBouncer in transaction-pooling mode in front of the database.

- **Redis and NATS:**
  - Offload read caching and asynchronous side-effects (notifications, shadows) from the primary database to maintain stable performance under bursty workloads.

---

```markdown
> 📐 **[DIAGRAM PLACEHOLDER]**
> _Type:_ ER Diagram
> _Description:_ Database schema showing tenant*id across tenant-scoped tables and their relationships, plus partitioning strategy for audit_logs and workflow_instances.
> \_To be created separately.*
```
