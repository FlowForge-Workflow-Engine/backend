# Schema Design Philosophy

## Overview

This document explains why the Multi-Tenant Workflow Engine uses **minimal ORM relations** and stores foreign keys as plain UUID strings instead of TypeORM `@ManyToOne` / `@OneToMany` decorators.

This is a **deliberate architectural decision** for a **Modular Monolith** designed to be **microservice-extractable** without rewrites.

---

## Core Principles

### 1. Module Boundary Enforcement

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
states.forEach(s => s.definition); // N queries (N+1 problem)
```

**Solution**: Explicit loading forces performance awareness:
```typescript
// ✅ EXPLICIT: You control what's loaded
const states = await stateRepo.find(); // 1 query
const definitions = await definitionRepo.findManyByIds(
  states.map(s => s.workflowDefinitionId)
); // 1 query (batch load)
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
  tenantId  // ← explicit tenant validation
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

## Comparison Table

| Aspect | With Relations | Without Relations (Current) |
|--------|---|---|
| **Module Coupling** | Tight | Loose ✅ |
| **Microservice Ready** | Requires refactor | Ready to extract ✅ |
| **Tenant Safety** | Risky | Explicit validation ✅ |
| **Query Control** | Implicit | Explicit ✅ |
| **N+1 Prevention** | Hard | Forced ✅ |
| **Contract Compliance** | Violates | Enforces ✅ |

---

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

| Entity | Why No Relations | How It's Used |
|--------|---|---|
| **WorkflowDefinition** | Aggregate root — children loaded explicitly | Service loads states/transitions on demand |
| **WorkflowState** | Child of definition — no back-reference needed | Loaded by ID or by definitionId |
| **WorkflowTransition** | Child of definition — references states by ID | Loaded by ID or by definitionId |
| **TransitionRule** | Child of transition — no back-reference needed | Loaded by transitionId |
| **InstanceFormSchema** | 1:1 with definition — loaded separately | Loaded by workflowDefinitionId |
| **WorkflowDefinitionVersion** | Immutable snapshot — self-contained | Loaded by versionNumber, never modified |

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

**Your schema is correctly designed.** The absence of cross-module relations is a **feature**, not a bug. It's the foundation of your modular monolith architecture and enables:

1. ✅ Strict module boundaries
2. ✅ Microservice extractability
3. ✅ Explicit data loading
4. ✅ Tenant isolation safety
5. ✅ Contract-based communication
6. ✅ Aggregate root pattern (DDD)
7. ✅ Immutable snapshots for versioning

This design allows the system to scale from a monolith to microservices without entity refactoring.

