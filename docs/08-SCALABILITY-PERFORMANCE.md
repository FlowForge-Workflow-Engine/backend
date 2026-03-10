---
Project: Multi-Tenant Workflow Engine SaaS Platform
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# Scalability & Performance Design Documentation

This document defines the scalability architecture, performance design decisions, and growth strategy for the platform. It covers horizontal and vertical scaling, the multi-layer caching strategy, database performance, async messaging, frontend performance, and the forward-looking microservice extraction and database partitioning roadmap.

---

## Table of Contents

- [1. Overview](#1-overview)
  - [1.1 Performance Targets (SLOs)](#11-performance-targets-slos)
  - [1.2 Scalability Goals](#12-scalability-goals)
- [2. Horizontal Scaling](#2-horizontal-scaling)
  - [2.1 Stateless Application Design](#21-stateless-application-design)
  - [2.2 Session Handling in a Clustered Environment](#22-session-handling-in-a-clustered-environment)
  - [2.3 NATS for Distributed Messaging](#23-nats-for-distributed-messaging)
- [3. Vertical Scaling](#3-vertical-scaling)
  - [3.1 Bun Runtime & Event Loop Optimisation](#31-bun-runtime--event-loop-optimisation)
  - [3.2 Memory & CPU Considerations](#32-memory--cpu-considerations)
- [4. Caching Strategy](#4-caching-strategy)
  - [4.1 Redis Cache Design](#41-redis-cache-design)
  - [4.2 Cache Invalidation Strategy](#42-cache-invalidation-strategy)
  - [4.3 What Is Cached — Full Catalogue](#43-what-is-cached--full-catalogue)
- [5. Database Performance](#5-database-performance)
  - [5.1 Connection Pooling](#51-connection-pooling)
  - [5.2 Query Optimisation Patterns](#52-query-optimisation-patterns)
  - [5.3 Index Design for Performance](#53-index-design-for-performance)
  - [5.4 Read Replica Strategy (Future)](#54-read-replica-strategy-future)
- [6. Messaging & Async Processing](#6-messaging--async-processing)
  - [6.1 NATS Integration](#61-nats-integration)
  - [6.2 Why NATS Over Kafka](#62-why-nats-over-kafka)
  - [6.3 Async Workflow Execution](#63-async-workflow-execution)
  - [6.4 Queue Depth & Backpressure](#64-queue-depth--backpressure)
- [7. Load Handling](#7-load-handling)
  - [7.1 Rate Limiting](#71-rate-limiting)
  - [7.2 Graceful Degradation](#72-graceful-degradation)
  - [7.3 Circuit Breaker Pattern](#73-circuit-breaker-pattern)
- [8. Frontend Performance](#8-frontend-performance)
  - [8.1 Vite Build Optimisation](#81-vite-build-optimisation)
  - [8.2 TanStack Query Caching](#82-tanstack-query-caching)
  - [8.3 Code Splitting](#83-code-splitting)
  - [8.4 CDN Strategy](#84-cdn-strategy)
- [9. Future Microservice Extraction & Scaling](#9-future-microservice-extraction--scaling)
  - [9.1 Module Extraction Order (Priority)](#91-module-extraction-order-priority)
  - [9.2 Database Partitioning Strategy](#92-database-partitioning-strategy)
  - [9.3 Multi-Tenant Scaling Strategy](#93-multi-tenant-scaling-strategy)
  - [9.4 Service Mesh Considerations](#94-service-mesh-considerations)
  - [9.5 Event Sourcing Consideration](#95-event-sourcing-consideration)

---

## 1. Overview

The platform is architected to handle multi-tenant SaaS workloads at scale without requiring architectural rewrites. Every scaling decision made at build time — stateless application design, immutable version snapshots, contract-first module boundaries, NATS-based async side effects, per-tenant rate limiting — was chosen to make both horizontal pod scaling and eventual microservice extraction low-effort operations.

The current deployment topology is a single NestJS process (with an embedded NATS server) backed by PostgreSQL and Redis. This is appropriate for early growth stages. The architecture is explicitly designed to evolve: add more pods, split NATS to an external cluster, extract high-throughput modules as separate services, and partition the database — all without rewriting business logic.

### 1.1 Performance Targets (SLOs)

The following targets are defined as internal SLOs. Production SLAs with customers should be negotiated based on these baselines. Where not yet measured under load, values are marked TBD.

| Metric                                        | Target SLO | Notes                                             |
| --------------------------------------------- | ---------- | ------------------------------------------------- |
| API P50 response time (simple reads)          | < 50 ms    | Cached reads from Redis                           |
| API P95 response time (simple reads)          | < 150 ms   | Cache miss hitting DB with RLS                    |
| API P50 response time (execute transition)    | < 200 ms   | Includes rule evaluation + optimistic lock UPDATE |
| API P99 response time (execute transition)    | < 800 ms   | Under concurrent load with Redis lock contention  |
| Workflow definition list (cached)             | < 30 ms    | Redis LONG TTL read                               |
| Version snapshot load (cached)                | < 20 ms    | Redis IMMUTABLE TTL read                          |
| Rule evaluation (expression rules, n≤5)       | < 10 ms    | In-process, no I/O                                |
| NATS event publish (fire-and-forget)          | < 5 ms     | Local loopback; no acknowledgement wait           |
| Audit log write latency (async)               | TBD        | Non-blocking; subscriber-side                     |
| PostgreSQL query P95 (indexed, tenant-scoped) | < 20 ms    | `maxQueryExecutionTime: 1000` logs slow queries   |
| Redis cache hit ratio (target)                | > 85%      | Measured per cache namespace                      |
| System uptime                                 | 99.95%     | ~4.4 hours/year downtime budget                   |
| Zero-downtime deploy                          | Required   | Rolling restart with health probes                |

### 1.2 Scalability Goals

**Current stage (monolith, single pod):** Handle up to ~500 concurrent users across ~50 tenants with moderate definition complexity (< 20 states, < 50 transitions per definition).

**Near-term target (multiple pods, shared Redis + NATS):** Handle up to ~5,000 concurrent users across ~500 tenants. Achieved by adding pod replicas behind a load balancer — no code changes required.

**Medium-term target (extracted execution service):** Isolate `WorkflowExecutionModule` as a dedicated service pod-scaled independently from the monolith. Handle ~50,000 concurrent users across ~5,000 tenants.

**Long-term target (full microservices + partitioned DB):** Each bounded context deployed as an independent service, connected via NATS. Hot tenants isolated into dedicated DB partitions or clusters. Handle ~500,000+ concurrent users.

---

## 2. Horizontal Scaling

### 2.1 Stateless Application Design

The NestJS application is **fully stateless** at the process level. There is no in-process session state, no in-memory tenant cache shared across requests, and no sticky-session requirement. Every piece of shared state lives in external systems:

| State Type                | Where Stored                                            | Rationale                                                                    |
| ------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Authentication state      | JWT (client-side) + `refresh_tokens` table (PostgreSQL) | JWTs are self-contained; refresh tokens are read from DB, not process memory |
| Rate limit bucket state   | Redis Hash (`wf-bucket:{tenantId}:*`)                   | Shared across all pods; atomic Lua scripts prevent race conditions           |
| Idempotency locks         | Redis (`wf-exec:{tenantId}:idempotency:{key}:lock`)     | Distributed lock; cross-pod safety guaranteed                                |
| Cache                     | Redis (`wf-*` namespaces)                               | All pods read/write the same Redis instance                                  |
| Workflow instance version | PostgreSQL `version` column                             | Optimistic lock enforced at DB level; any pod can serve the transition       |
| CSRF session              | `HttpOnly` cookie (client-side)                         | Stateless from server perspective; cookie carries the secret                 |
| Pub/sub routing           | NATS                                                    | External message bus; all pods subscribe to same subjects                    |

This means **adding a new pod requires zero configuration changes** — the new instance connects to the same PostgreSQL, Redis, and NATS, and immediately serves traffic. The load balancer may use any distribution strategy (round-robin, least-connections) because there is no in-process affinity.

**Container-level configuration:**

```dockerfile
# Dockerfile — oven/bun:1-alpine (minimal Alpine base)
ENV HOST=0.0.0.0      # Listen on all interfaces for load balancer routing
ENV PORT=10000        # Standardised port; exposed for external access
```

`app.set('trust proxy', 1)` in `main.ts` enables correct real-IP extraction when behind a Render load balancer, AWS ALB, or Nginx — required for per-user rate limit bucketing and audit IP logging.

### 2.2 Session Handling in a Clustered Environment

There are no server-side sessions. The session model is:

**Access token (JWT):** 15-minute short-lived token. Validated entirely in-process by `JwtStrategy` using `JWT_SECRET`. Any pod holding the same secret can validate any token — no coordination required.

**Refresh token (opaque):** Stored as `sha256(rawToken)` in `refresh_tokens` table. Any pod can look up the hash and perform token rotation — the operation is a DB read + write, fully compatible with any pod handling the request.

**CSRF token:** Stored as an `HttpOnly` cookie on the client. The `csurf` middleware derives the token from the cookie secret deterministically. Any pod receiving the same cookie + header combination can verify the token — no shared session store needed.

**Consequence:** A user's session is never pinned to a pod. Sticky sessions at the load balancer level are explicitly not required and should not be configured — they would artificially limit horizontal scaling benefit.

### 2.3 NATS for Distributed Messaging

In the current single-pod deployment, NATS runs as an **embedded server** within the Docker container (installed from the `nats-server v2.12.0` binary in the Dockerfile). This is a deliberate development/early-production convenience — the app self-contains its messaging without an external dependency.

For multi-pod horizontal scaling, NATS must be extracted to an **external NATS cluster**. The application already supports this — the `NATS_URL` environment variable in `createNatsOptions()` accepts any `nats://host:port` string:

```typescript
// src/infra/nats.config.ts
return {
  servers: [natsUrl], // set NATS_URL to external cluster URL
  maxReconnectAttempts: -1, // unlimited reconnect — handles transient failures
  reconnectTimeWait: 2_000, // 2-second backoff between reconnect attempts
  name: appName, // connection name for NATS monitoring dashboard
};
```

**Multi-pod event delivery guarantee:** NATS uses a publish/subscribe model. When multiple pods are running, all pods subscribe to the same event subjects (e.g., `workflow-execution.transition.completed`). This means every event is delivered to **all pods simultaneously**, and each pod's subscriber processes the event independently. For idempotent subscribers (Audit, Notification, AuthEventsSubscriber) this is safe — they all perform the same `insertIfAbsent(eventId)` check, and at most one INSERT succeeds. For a future architecture where only one pod should process each event, NATS JetStream queue groups can be used.

```
Pod 1 ──publishes──▶ NATS subject: workflow-execution.transition.completed
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
           Pod 1        Pod 2       Pod 3
         (AuditSub)  (AuditSub)  (AuditSub)
             │           │           │
          checks      checks      checks
         eventId     eventId     eventId
           (dup)      (dup)      (inserts)
```

The `UNIQUE(event_id)` constraint on `audit_logs` and the `insertIfAbsent` pattern ensure exactly one audit record is written regardless of how many pods receive the event.

---

## 3. Vertical Scaling

### 3.1 Bun Runtime & Event Loop Optimisation

The application runs on **Bun** (a high-performance JavaScript runtime built on WebKit's JavaScriptCore engine) rather than Node.js. Bun provides measurably faster startup times, lower memory overhead, and higher HTTP throughput than Node.js for equivalent NestJS applications — benchmarks consistently show 2–3× throughput improvement for I/O-bound workloads.

**Event loop characteristics:**

NestJS on Bun is single-threaded per-process. The event loop is highly effective for I/O-bound operations (database queries, Redis calls, HTTP requests), which constitute the vast majority of this application's work. CPU-bound operations that could block the event loop are intentionally avoided:

- **Rule evaluation** (`json-rules-engine`) is in-process and synchronous, but the rule AST evaluation for typical rules (n ≤ 10 conditions) completes in under 5 ms — well within the event loop budget.
- **Snapshot serialisation** (on publish) is a single `JSON.stringify()` call over a bounded object — sub-millisecond.
- **Argon2id hashing** (on login) is CPU-intensive by design (that is its security property). Because login operations are rate-limited to 200 burst/120 rpm per user, the hashing cost never accumulates enough to meaningfully block the event loop.
- **No blocking synchronous I/O** exists in any hot path. All repository calls, Redis operations, and external HTTP requests use `async/await` throughout.

**Request body size limit** is capped at **50 KB** (`json({ limit: '50kb' })`) in `main.ts`. This prevents a class of memory exhaustion attacks where a large body forces the JSON parser to allocate a multi-megabyte string before validation can reject it.

**Compression middleware** (`compression ^1.8.1`) is applied globally. Response compression reduces network transfer time for large paginated responses (definition lists, instance lists, audit logs) and lowers bandwidth costs on cloud deployments billed by egress.

### 3.2 Memory & CPU Considerations

**Heap pressure — connection pools:** The TypeORM connection pool is configured with `max: 20` connections. Each PostgreSQL connection uses ~5–10 MB of memory at the database server. With 20 connections per pod and 3 pods, that is 60 total server connections — well within typical managed PostgreSQL limits (default max_connections = 100; recommended to set 200+ on production instances).

**Heap pressure — Redis client:** `ioredis` maintains a single persistent connection with `maxRetriesPerRequest: 3` and `enableReadyCheck: true`. The client uses a built-in command queue for buffering during brief disconnects, avoiding connection churn.

**CPU spikes — Argon2id:** Each login attempt invoking `argon2verify()` uses ~40 ms of CPU time (configurable memory cost). At the 120-rpm per-user sustained rate, this generates at most 2 verifications/second per user per pod — negligible load. The primary CPU concern is a targeted brute-force attack against a single account, which the rate limiter prevents before Argon2 can be called at volume.

**CPU spikes — NATS event flood:** If a large batch of transitions completes simultaneously (e.g., a scheduler closing 500 instances), the NATS subscriber receives 500 events in rapid succession. Each `AuditSubscriber.onTransitionCompleted()` call is an async DB INSERT with an idempotency check. These are queued by the NestJS microservice transport and processed serially via the event loop — they do not cause unbounded memory growth.

**Memory monitoring targets:** Healthy pods should maintain heap usage below 400 MB. Above 600 MB, consider adding pods. Above 800 MB on a single pod, investigate for memory leaks (typically caused by uncleaned timers, circular references in large object trees, or accumulating in-memory state).

---

## 4. Caching Strategy

### 4.1 Redis Cache Design

Redis is used as an explicit **cache-aside layer** — the application always decides when to read from cache and when to invalidate. There is no transparent ORM-level caching. This design provides predictable invalidation semantics and makes cache behaviour auditable in the codebase.

All cache reads follow the same pattern:

```typescript
// Pattern: cache-aside read
async findById(id: string, tenantId: string): Promise<T | null> {
  const cacheKey = CacheKeys.someEntity(tenantId, id);

  // 1. Try cache
  const cached = await this.redis.get<T>(cacheKey);
  if (cached) return cached;

  // 2. On cache miss, read from DB (with RLS active)
  const result = await this.repository.findOne({ where: { id, tenantId } });
  if (!result) return null;

  // 3. Populate cache
  await this.redis.set(cacheKey, result, CacheTTL.MEDIUM);
  return result;
}
```

The `RedisService.get()` and `RedisService.set()` methods handle JSON serialisation/deserialisation transparently. All Redis operations are wrapped in `try/catch` — a Redis failure silently returns `null` from `get()` (forcing a DB fallback) or is a no-op for `set()`. **Redis is never in the critical path for correctness** — only for performance.

**Key namespace design:** All keys are prefixed with a module abbreviation and scoped by `tenantId`, preventing accidental cross-tenant cache reads and enabling pattern-based invalidation (`SCAN + DEL` by prefix):

```
wf-auth:    → Identity & Access module
wf-tenant:  → Tenancy module
wf-def:     → Workflow Definition module
wf-exec:    → Workflow Execution module
wf-notif:   → Notification module
wf-rl:      → Rate Limiting
wf-bucket:  → Leaky bucket rate limit state
```

### 4.2 Cache Invalidation Strategy

The system uses **explicit, event-driven invalidation** — caches are deleted immediately when the underlying data changes. There is no background refresh or probabilistic expiry for mutable data. Two patterns are used:

**Pattern 1 — Synchronous invalidation on write:** The service method that mutates data also deletes the relevant cache keys before returning the response. Cache deletion happens via `Promise.allSettled()` — a Redis failure to delete a key does not fail the mutation.

```typescript
// WorkflowDefinitionService.update()
await this.definitionRepository.save(updated);
await Promise.allSettled([
  this.redis.del(CacheKeys.workflowDefinition(tenantId, id)),
  this.redis.del(CacheKeys.workflowDefinitionList(tenantId)),
]);
```

**Pattern 2 — Transition-triggered invalidation:** `ExecuteTransitionHandler` invalidates the instance's detail and allowed-transitions caches immediately after the atomic UPDATE, ensuring the next read reflects the new state:

```typescript
// After optimistic-lock UPDATE succeeds:
await Promise.allSettled([
  this.redis.del(CacheKeys.allowedTransitions(tenantId, instanceId)),
  this.redis.del(CacheKeys.instanceDetail(tenantId, instanceId)),
]);
```

**Immutable caches (never invalidated):** Version snapshots (`wf-def:{tenantId}:def:{definitionId}:snapshot:v{N}`) are set with `CacheTTL.IMMUTABLE` (24 hours) and are **never explicitly deleted**. Once a snapshot is written, it is mathematically guaranteed not to change — its TTL is purely a memory management measure, not a staleness control. On cache expiry, the next read fetches the snapshot from the DB (which is equally immutable) and re-caches it.

**Pattern-based bulk invalidation:** `RedisService.delByPattern(pattern)` uses a non-blocking `SCAN`-based approach (cursor = 100 keys per iteration) to delete all keys matching a glob. This is used when a tenant's entire cache namespace should be cleared (e.g., on tenant deactivation): `await redis.delByPattern('wf-*:{tenantId}:*')`.

### 4.3 What Is Cached — Full Catalogue

| Cache Key Pattern                                              | Module             | TTL                     | Invalidated By                           | Purpose                                                                         |
| -------------------------------------------------------------- | ------------------ | ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| `wf-auth:{tenantId}:user:{userId}:summary`                     | Auth               | MEDIUM (5 min)          | User update, deactivation                | User summary for cross-module reads via `USER_QUERY_CONTRACT`                   |
| `wf-auth:{tenantId}:user:{userId}:roles`                       | Auth               | MEDIUM (5 min)          | Role assignment/removal                  | User role list — reduces DB reads on role checks                                |
| `wf-auth:{tenantId}:users`                                     | Auth               | SHORT (1 min)           | User create/update/delete                | Tenant user list (admin page)                                                   |
| `wf-auth:{tenantId}:jwt:{userId}`                              | Auth               | SHORT (1 min)           | Logout, deactivation                     | JWT user validation cache                                                       |
| `wf-tenant:{tenantId}:detail`                                  | Tenant             | MEDIUM (5 min)          | Tenant update                            | Tenant summary (name, slug, plan, isActive)                                     |
| `wf-tenant:slug:{slug}:detail`                                 | Tenant             | MEDIUM (5 min)          | Tenant slug change                       | Slug-to-tenant resolution for self-registration                                 |
| `wf-tenant:{tenantId}:settings`                                | Tenant             | MEDIUM (5 min)          | Settings update                          | `maxUsers`, `maxWorkflows`, `timezone`, `branding`                              |
| `wf-tenant:{tenantId}:feature-flags`                           | Tenant             | MEDIUM (5 min)          | Feature flag toggle                      | Feature flag map for a tenant                                                   |
| `wf-tenant:{tenantId}:plan`                                    | Tenant             | MEDIUM (5 min)          | Plan upgrade/downgrade                   | Plan tier for gate checks                                                       |
| `wf-def:{tenantId}:def:{definitionId}`                         | WorkflowDefinition | LONG (1 hour)           | Definition update, publish, deprecate    | Definition detail (name, status, currentVersion)                                |
| `wf-def:{tenantId}:list`                                       | WorkflowDefinition | LONG (1 hour)           | Definition create/update/delete          | Paginated definition list                                                       |
| `wf-def:{tenantId}:def:{definitionId}:states`                  | WorkflowDefinition | LONG (1 hour)           | State create/update/delete, publish      | All states for a definition (design-time reads)                                 |
| `wf-def:{tenantId}:def:{definitionId}:transitions`             | WorkflowDefinition | LONG (1 hour)           | Transition create/update/delete, publish | All transitions for a definition (design-time reads)                            |
| `wf-def:{tenantId}:def:{definitionId}:instance-form-schema`    | WorkflowDefinition | LONG (1 hour)           | Rule create/delete                       | Accumulated form schema for instance payload validation                         |
| `wf-def:{tenantId}:def:{definitionId}:snapshot:v{N}`           | WorkflowDefinition | IMMUTABLE (24 hours)    | **Never** — immutable by design          | Published version snapshot JSONB; used by execution module                      |
| `wf-exec:{tenantId}:instance:{instanceId}:detail`              | WorkflowExecution  | MEDIUM (5 min)          | Successful transition, cancellation      | Instance detail including current state and payload                             |
| `wf-exec:{tenantId}:instance:{instanceId}:allowed-transitions` | WorkflowExecution  | MEDIUM (5 min)          | Successful transition                    | Filtered transitions for current actor and instance state                       |
| `wf-exec:{tenantId}:idempotency:{key}`                         | WorkflowExecution  | IDEMPOTENCY (5 min)     | Never (TTL-based expiry)                 | Cached result of a completed transition; prevents duplicate processing on retry |
| `wf-exec:{tenantId}:idempotency:{key}:lock`                    | WorkflowExecution  | 30 seconds (hard-coded) | Deleted after transition completes       | Distributed lock preventing concurrent duplicate transitions                    |
| `wf-notif:{tenantId}:templates:{eventTrigger}`                 | Notification       | MEDIUM (5 min)          | Template create/update/delete            | Notification templates per event trigger                                        |
| `wf-notif:{tenantId}:webhooks:{eventTrigger}`                  | Notification       | MEDIUM (5 min)          | Webhook config create/update/delete      | Webhook configs per event trigger                                               |
| `wf-bucket:{tenantId}:tenant`                                  | Rate Limiting      | 1 hour (EXPIRE)         | N/A — rolling window                     | Leaky bucket state for tenant-level rate limit                                  |
| `wf-bucket:{tenantId}:user:{userId}`                           | Rate Limiting      | 1 hour (EXPIRE)         | N/A — rolling window                     | Leaky bucket state for user-level rate limit                                    |

**Cache hit rate impact:** The highest-value cache entries are version snapshots and definition details. A typical workflow session involves: load definition (LONG TTL), load snapshot (IMMUTABLE), execute transition (reads snapshot + instance detail). After the first transition, all snapshot reads are cache hits for 24 hours. For a system with 1,000 active instances, this eliminates thousands of PostgreSQL snapshot queries per hour.

---

## 5. Database Performance

### 5.1 Connection Pooling

TypeORM is configured with a PostgreSQL connection pool via the `extra` configuration block in `ormconfig.ts`:

```typescript
extra: {
  max: 20,                         // Maximum pool size per pod
  idleTimeoutMillis: 30_000,       // Idle connections closed after 30 seconds
  connectionTimeoutMillis: 10_000, // New connection request times out after 10 seconds
}
```

**Pool sizing rationale:** With `max: 20`, a single pod can sustain 20 concurrent in-flight database queries. At P95, most API requests complete in under 150 ms, meaning the effective throughput is approximately `20 / 0.15s = ~133 concurrent requests` before connection starvation. For a three-pod deployment, the total PostgreSQL connection count is 60 — well within a production PostgreSQL instance's capacity.

**For managed PostgreSQL services** (Render, AWS RDS, Supabase), consider deploying a **PgBouncer** connection pooler in `transaction mode` in front of PostgreSQL. PgBouncer can multiplex thousands of application connections into a small number of actual PostgreSQL server connections, enabling pod counts to scale to 20+ without exhausting `max_connections`. When using PgBouncer in transaction mode, PostgreSQL's `PREPARE`d statements and session-level variables (including `app.tenant_id` used by RLS) must be configured to use connection-level settings — the `set_config` call with the third parameter set to `true` (transaction-local) is already correctly configured for this.

**Slow query logging:** `maxQueryExecutionTime: 1000` in the ORM config logs any query taking longer than 1 second. This is the primary mechanism for identifying N+1 query regressions and missing index opportunities during development and staging.

### 5.2 Query Optimisation Patterns

**Pattern 1 — Tenant-first WHERE clause:** Every repository query includes `tenant_id` as the leading filter, matching the leading column of every composite index (see §5.3). This ensures the query planner selects the correct index and does not fall back to a full table scan.

```sql
-- Correct: tenant_id first → uses (tenant_id, status) composite index
SELECT * FROM workflow_instances
WHERE tenant_id = $1 AND status = $2
ORDER BY created_at DESC LIMIT 20;

-- Wrong: status first → cannot use the index efficiently
SELECT * FROM workflow_instances WHERE status = $1 AND tenant_id = $2;
```

**Pattern 2 — Denormalised `current_state_name`:** `WorkflowInstance` stores both `current_state_id` (UUID FK to the state graph) and `current_state_name` (VARCHAR). Instance list views and audit displays need the state name for display. Rather than joining to the snapshot JSONB or back to `workflow_states`, the name is denormalised directly on the instance. It is updated atomically in the same `UPDATE` statement as `current_state_id`. The trade-off (slight write overhead per transition) eliminates a join on every instance read — especially valuable for paginated list views returning 20+ instances.

**Pattern 3 — No TypeORM `@ManyToOne` / `@OneToMany` relations on cross-context boundaries:** All cross-module entity references use plain UUID columns without TypeORM relation decorators. This prevents TypeORM from issuing implicit `JOIN`s or eager-loading related data, giving full control over query shape. The only `@OneToMany` relation in the codebase is `User.userRoles` — used exclusively in the role-loading path during authentication.

**Pattern 4 — JSONB field access for filters:** The `instance_form_schemas.schema` and `workflow_definition_versions.snapshot` are accessed as complete JSONB blobs, never queried with JSONB operators (`@>`, `->>`). This avoids the PostgreSQL JSONB operator overhead and the need for GIN indexes on these columns, since the entire blob is always fetched and parsed in-process.

**Pattern 5 — `Promise.allSettled()` for parallel cache invalidation:** Cache DEL calls after mutations use `Promise.allSettled()` rather than sequential `await`. Invalidating five keys takes `max(key1_latency, key2_latency, ...)` rather than their sum.

### 5.3 Index Design for Performance

All indexes are created in migration `1772830603496`. Every tenant-scoped table has at minimum a single-column `tenant_id` index, and high-query tables have additional composite indexes:

| Index Name         | Table                          | Columns                                    | Type         | Query Pattern                           |
| ------------------ | ------------------------------ | ------------------------------------------ | ------------ | --------------------------------------- |
| `IDX_b1d9f2a0...`  | `workflow_instances`           | `(tenant_id)`                              | BTREE        | All tenant-scoped reads                 |
| `IDX_315b3ee1...`  | `workflow_instances`           | `(tenant_id, workflow_definition_id)`      | BTREE        | Instances by definition                 |
| `IDX_546667131...` | `workflow_instances`           | `(tenant_id, status)`                      | BTREE        | Active/completed/cancelled filters      |
| `IDX_d04275c2...`  | `workflow_definition_versions` | `(workflow_definition_id, version_number)` | UNIQUE BTREE | Snapshot lookup by definition + version |
| `IDX_2d7c912f...`  | `instance_form_schemas`        | `(workflow_definition_id)`                 | UNIQUE BTREE | Form schema by definition               |
| `IDX_e9f4c2ef...`  | `users`                        | `(tenant_id, email)`                       | UNIQUE BTREE | Login credential lookup                 |
| `IDX_c555146b...`  | `roles`                        | `(tenant_id, name)`                        | UNIQUE BTREE | Role name deduplication                 |
| `IDX_a7838d2b...`  | `refresh_tokens`               | `(token_hash)`                             | UNIQUE BTREE | O(1) token lookup by hash               |
| `IDX_3ddc983c...`  | `refresh_tokens`               | `(user_id)`                                | BTREE        | Revoke all tokens for a user            |
| `IDX_68f97a33...`  | `audit_logs`                   | `(instance_id)`                            | BTREE        | Audit history by instance               |
| `IDX_898d14750...` | `audit_logs`                   | `(tenant_id, created_at)`                  | BTREE        | Time-range audit queries                |
| `IDX_ef8394416...` | `audit_logs`                   | `(tenant_id, instance_id)`                 | BTREE        | Tenant-scoped audit by instance         |
| `IDX_fc9cd3db...`  | `we_user_shadows`              | `(tenant_id)`                              | BTREE        | Shadow reads scoped to tenant           |

**Index design principles applied:**

- All composite indexes lead with `tenant_id` because RLS adds `AND tenant_id = $context` to every query — the planner can always push this predicate to the leading index column.
- `audit_logs` has two composite indexes to support both time-range scans (compliance exports: `WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3`) and instance-specific history reads (`WHERE tenant_id = $1 AND instance_id = $2`).
- `workflow_instances (tenant_id, status)` supports the most common dashboard query pattern: counting active instances across all definitions for a tenant.
- Unique indexes on `refresh_tokens.token_hash` and `users.(tenant_id, email)` serve double duty as performance indexes (O(1) lookup) and database-enforced uniqueness constraints.

### 5.4 Read Replica Strategy (Future)

The current architecture uses a single PostgreSQL primary for all reads and writes. For the medium-term scaling target (5,000+ tenants), reads can be offloaded to one or more read replicas:

**CQRS alignment:** `WorkflowExecutionModule` already uses the CQRS pattern with dedicated `@QueryHandler` classes (`GetInstanceDetailHandler`, `GetInstanceListHandler`, `GetAllowedTransitionsHandler`). These handlers are isolated from write paths and have no side effects. Routing their `DataSource` injection to a read-replica `DataSource` requires only changing the injection token — no business logic changes.

**Implementation path:**

```typescript
// Future: register a secondary DataSource for read replicas
const readReplicaDataSource = new DataSource({
  ...createOrmConfig(configService),
  host: configService.get("DB_READ_REPLICA_HOST"),
});

// Query handlers inject READ_DATASOURCE, command handlers inject DataSource (primary)
@QueryHandler(GetInstanceListQuery)
export class GetInstanceListHandler {
  constructor(@InjectDataSource("READ_REPLICA") private readonly readDs: DataSource) {}
}
```

**Cache as a near-term alternative:** For many read patterns (definition details, snapshots, user summaries), the Redis cache already provides sub-millisecond reads without requiring read replicas. Read replicas primarily benefit workloads with low cache hit rates — high-cardinality queries with many unique filter combinations (e.g., per-user audit log exports) that cannot be effectively cached.

---

## 6. Messaging & Async Processing

### 6.1 NATS Integration

NATS is used for all asynchronous domain event publishing and consumption in the system. The integration uses two distinct mechanisms:

**Publishing (fire-and-forget):** Publisher classes (`AuthPublisher`, `TenantPublisher`, `WorkflowDefinitionPublisher`, `ExecutionPublisher`) use the raw `NatsConnection` client from `ioredis`-style `@Inject(NATS_CLIENT)`. They call `natsClient.publish(subject, jc.encode(payload))` — a synchronous, non-blocking call that hands the message to the NATS client buffer. There is no `await`, no acknowledgement, and no backpressure from the publisher side. If NATS is temporarily unavailable, the publish call throws and is caught + logged — the originating operation (transition, user creation) succeeds regardless.

**Subscribing (pattern handler):** Subscriber classes use `@EventPattern(NatsEvents.SOME_EVENT)` from `@nestjs/microservices`. The NestJS hybrid microservice setup (`app.connectMicroservice()` + `app.startAllMicroservices()` in `main.ts`) registers the app as a NATS subscriber. Incoming messages are deserialized with `JSONCodec` and dispatched to the corresponding `@EventPattern` handler method.

**Connection resilience:** NATS is configured with `maxReconnectAttempts: -1` (unlimited) and `reconnectTimeWait: 2000` ms. The client automatically re-queues in-flight messages during reconnect windows. For the current at-most-once delivery model, messages published during a NATS outage are silently dropped — the audit idempotency system handles this gracefully (missed events simply produce no audit record, which is preferable to a duplicate).

### 6.2 Why NATS Over Kafka

Kafka is a log-structured streaming platform designed for high-throughput, durable event streaming at the scale of millions of events per second with long-term event replay. Evaluating it against this system's actual requirements reveals significant over-engineering risk:

**Operational complexity:** Kafka requires a ZooKeeper ensemble (or KRaft in newer versions), multiple broker nodes for replication, and careful partition assignment for consumer groups. The minimum production-grade Kafka deployment involves 3 brokers + 3 ZooKeeper nodes. NATS runs as a single 10 MB binary with zero external dependencies. The Dockerfile installs it with a single `curl` command.

**Event volume mismatch:** This system produces at most 14 distinct event types across all domain actions. Even at 10,000 workflow transitions per hour (a generous estimate for an early-stage SaaS product), that is ~3 events/second of peak NATS traffic. NATS handles millions of messages per second per node — Kafka's partitioning and consumer group machinery provides no benefit at this volume.

**Latency characteristics:** Kafka achieves high throughput through batching — messages are buffered and flushed in batches every few milliseconds. For audit log writes that follow workflow transitions, this introduces unnecessary latency. NATS delivers sub-millisecond message-to-handler dispatch on a local network, making the audit record available almost instantaneously after the transition.

**At-most-once vs at-least-once:** This system's subscribers are all idempotent (they check `eventId` before processing). The failure mode of NATS (message loss on broker restart) is tolerable because a missed notification email or audit record for a single event is a minor operational issue, not a data correctness issue. Kafka's at-least-once guarantee would require all subscribers to implement idempotency anyway — which the system already does — making the stronger delivery guarantee moot in practice.

**Microservice extraction path:** NATS JetStream (persistent, acknowledgement-based messaging) is a natural upgrade path within the NATS ecosystem when durable delivery becomes a requirement. Migrating from core NATS to JetStream requires only changing the client configuration — the `@EventPattern` subscriber API remains identical. Migrating from NATS to Kafka would require rewriting all publisher and subscriber classes plus changing the hybrid microservice transport.

**Summary:** NATS is the correct choice for this system's event volume, deployment simplicity, and microservice extraction roadmap. Kafka should be re-evaluated only if event throughput exceeds ~100,000 events/second or if long-term event log replay (event sourcing) becomes a core product feature.

### 6.3 Async Workflow Execution

The current execution model is **synchronous with async side effects**:

- The `ExecuteTransitionCommand` handler runs synchronously within the HTTP request: it validates, evaluates rules, performs the optimistic-lock UPDATE, and returns the result to the HTTP caller.
- Side effects (audit logging, email notifications, webhook delivery) are triggered by NATS events and processed asynchronously by subscribers — they run after the HTTP response is already sent.

This design provides two important properties:

1. **HTTP response latency is bounded.** The caller receives a definitive result (success or error code) within the single request. There is no polling or long-polling required.
2. **Side effects are non-blocking.** A slow email server or a failing webhook endpoint never delays a transition. The `NotificationSubscriber` and `AuditSubscriber` operate completely independently from the execution pipeline.

For use cases requiring asynchronous transition triggering (e.g., a scheduler that advances thousands of instances overnight), the `POST /workflow-instances/:id/transitions` endpoint can be called asynchronously from a job queue. The idempotency key mechanism (`X-Idempotency-Key` header) ensures that safe retry of a failed HTTP call never produces a duplicate transition.

### 6.4 Queue Depth & Backpressure

NATS core (non-JetStream) does not provide persistent queues or explicit backpressure signals. Messages are delivered to connected subscribers in memory. If a subscriber is processing events slower than they arrive:

**Current mitigation:** `AuditSubscriber` and `NotificationSubscriber` handlers are `async` functions. The NestJS NATS transport processes one message at a time per subscriber handler — it awaits each handler before processing the next message on that subject. This provides implicit backpressure through serialisation: the subscriber cannot accept a new message until it finishes processing the current one. At the current event volume this is never a bottleneck.

**Future mitigation (NATS JetStream):** When event volume grows, NATS JetStream provides explicit consumer groups with acknowledgement-based delivery. The broker retains messages until the consumer acknowledges them — providing durable buffering and back-pressure-aware delivery. Migration is a configuration change, not an architectural change.

**Memory safety:** NATS has a configurable `max_pending` per subscription. If a slow subscriber accumulates more than `max_pending` unprocessed messages, NATS closes the subscription and triggers a reconnect — preventing unbounded in-memory queue growth on either the client or the broker.

---

## 7. Load Handling

### 7.1 Rate Limiting

The system implements a **two-layer rate limiting strategy** that provides both tenant isolation and a global backup guard:

**Layer 1 — `EnhancedRateLimitMiddleware` (Redis-backed leaky bucket):**

Applied to all routes except health check endpoints. Operates at the tenant and user level independently.

```
Bucket Configuration:
  Tenant:  capacity = 1,000 tokens  |  leak_rate = 10 tokens/sec  (600 req/min sustained)
  User:    capacity = 200 tokens    |  leak_rate = 2 tokens/sec   (120 req/min sustained)
```

The **leaky bucket algorithm** solves the noisy-neighbour problem through complete per-tenant isolation. Each tenant has its own Redis Hash with the current token count. Tenant A exhausting its quota has zero impact on Tenant B's bucket. The smooth leak rate prevents the thundering-herd effect seen with fixed time-window counters (where all limits reset simultaneously, creating traffic spikes).

The Lua script executes the entire check-and-consume atomically on Redis:

```lua
local bucket      = redis.call('HMGET', key, 'tokens', 'last_refill')
local cur_tokens  = tonumber(bucket[1]) or capacity
local last_refill = tonumber(bucket[2]) or now
local elapsed     = (now - last_refill) / 1000
local leaked      = math.floor(elapsed * leak_rate)
cur_tokens = math.max(0, cur_tokens - leaked)
if cur_tokens >= 1 then cur_tokens = cur_tokens - 1; allowed = 1 end
redis.call('HMSET', key, 'tokens', cur_tokens, 'last_refill', now)
redis.call('EXPIRE', key, 3600)
return {allowed, cur_tokens, reset_time}
```

Atomic execution in Redis prevents the double-spend race condition that non-atomic multi-command implementations suffer from.

**Layer 2 — `ThrottlerGuard` (memory-backed global limiter):**

Registered as `APP_GUARD` via `ThrottlerModule.forRootAsync()`. Configuration driven by `THROTTLE_TTL` and `THROTTLE_LIMIT` environment variables. Operates as a global fallback — it is not tenant-aware, but it provides rate limiting coverage when Redis is unavailable (fail-open scenario from Layer 1).

```
Layer 1 → Redis available:  per-tenant leaky bucket (precise, isolated)
Layer 1 → Redis unavailable: fail-open (passes through with WARN log)
Layer 2 → always active:     global memory-based backup
```

**Exemptions:** `SYSTEM_ADMIN` roles bypass Layer 1 entirely. Health check endpoints are excluded from both layers via `MiddlewareConsumer.exclude()` and `ThrottlerGuard` skip logic.

**Response headers:** Allowed requests include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Tenant-Remaining`, and `X-RateLimit-User-Remaining` — enabling clients to implement adaptive throttling.

### 7.2 Graceful Degradation

The system is designed to degrade gracefully under partial failure:

| Component Failure                  | Behaviour                                                                                                                                                                   | Impact                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Redis unavailable**              | Cache reads return `null` (DB fallback); cache writes are no-ops; rate limiting fails-open (all requests pass); idempotency locks fail-open (duplicate protection disabled) | Increased DB load; temporary loss of per-tenant rate limiting; backup `ThrottlerGuard` remains active |
| **NATS unavailable**               | `publish()` calls throw, caught + logged; originating operation (transition, login) succeeds                                                                                | Audit logs and notifications for events during outage are lost; no core functionality impacted        |
| **PostgreSQL temporarily slow**    | `connectTimeoutMS: 10_000` triggers timeout; `UnprocessableEntityException` returned to caller; requests queue in connection pool up to `max: 20`                           | Elevated error rate; requests exceeding connection pool timeout fail fast                             |
| **Single pod crash**               | Load balancer routes traffic to remaining pods; NATS reconnects on other pods; no state lost (all in Redis/PostgreSQL)                                                      | Brief request failures during routing convergence; full recovery in < 5 seconds                       |
| **Audit subscriber lag**           | Audit log writes are delayed, not lost (NATS buffers in memory up to `max_pending`); NATS closes subscription and triggers reconnect if buffer exhausted                    | Audit history delayed; no core workflow functionality impacted                                        |
| **Email/webhook delivery failure** | `NotificationLog` or `WebhookDeliveryLog` records failure with `status = FAILED`; no retry currently (future: job queue)                                                    | Missed notification for that event; workflow continues normally                                       |

**Health check endpoints** (`GET /health`, `GET /health/ready`) are served by `HealthModule` using `@nestjs/terminus`. They check PostgreSQL connectivity and Redis connectivity and return standard health check JSON for Kubernetes liveness/readiness probes. Pods failing health checks are removed from the load balancer rotation automatically.

### 7.3 Circuit Breaker Pattern

The system does not currently implement explicit circuit breakers (e.g., via `opossum` or similar). The existing fail-safe patterns serve the same purpose within the current operational scale:

- **Redis:** `RedisService` wraps every call in `try/catch`. After repeated failures, the application continues serving requests from the database — functionally equivalent to an open circuit state.
- **NATS:** The `publish()` wrapper catches errors silently. Subscriber reconnection is handled automatically by the NATS client with `maxReconnectAttempts: -1`.
- **External webhooks:** `WebhookService` delivers via `axios.post()`. Failed requests are logged in `webhook_delivery_logs` but do not trigger retries or circuit opening — each delivery is independent.

**Recommendation for medium-term:** As the notification module scales to handle high volumes of webhook deliveries to potentially unreliable external endpoints, implementing a circuit breaker per `webhookConfig.url` will prevent slow external endpoints from causing thread/connection exhaustion. The `opossum` library integrates cleanly with the existing `WebhookService` pattern.

---

## 8. Frontend Performance

### 8.1 Vite Build Optimisation

The frontend uses **Vite 5** with the `@vitejs/plugin-react-swc` plugin. SWC (Speedy Web Compiler) is a Rust-based TypeScript/JSX transpiler that is 10–20× faster than Babel, significantly reducing HMR (Hot Module Replacement) latency during development and build times in CI.

**Build output characteristics:**

Vite's production build uses Rollup for bundling with automatic chunk splitting at the `import()` boundary (dynamic imports). ES module output (`type: "module"` in the generated HTML) is used by default, enabling browsers to tree-shake dead code and only download used modules.

**Development proxy:** Vite's dev server is configured with a proxy that forwards `/api` requests to the NestJS backend on `localhost:3000`:

```typescript
// vite.config.ts
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
    secure: false,
  }
}
```

This eliminates CORS preflight requests during development and mirrors the production deployment topology where the frontend and API share a domain.

**Path aliases:** `@` is aliased to `./src` in both `vite.config.ts` and `tsconfig.json`, enabling import paths like `import { queryClient } from '@/lib/query-client'` rather than fragile relative paths.

### 8.2 TanStack Query Caching

TanStack Query (`@tanstack/react-query ^5.83.0`) manages all server state. The global `QueryClient` is configured with:

```typescript
// src/lib/query-client.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes — data considered fresh for 2 min
      retry: (count, err) => {
        if ([401, 403, 404].includes(err?.response?.status)) return false;
        return count < 2; // Retry up to 2 times on transient errors
      },
    },
  },
});
```

**`staleTime: 2 minutes`** means that navigating away from a page and back within 2 minutes reuses the cached query result without a network request. This is appropriate for workflow definition lists, user lists, and role lists — data that changes rarely within a session. Combined with the `invalidateQueries()` calls on mutation success, the frontend stays in sync without aggressive background refetching.

**Smart retry policy:** Requests that fail with `401`, `403`, or `404` are not retried. This prevents flooding the API with repeated requests for resources the user has no access to (role-restricted endpoints) or that genuinely don't exist. Transient server errors (`500`, network timeout) are retried up to twice.

**Structured query keys:** All cache keys are defined in `src/lib/query-keys.ts` as typed factory functions:

```typescript
workflowInstances: {
  list:               (params?) => ['workflow-instances', 'list', params],
  detail:             (id) =>     ['workflow-instances', id],
  allowedTransitions: (id) =>     ['workflow-instances', id, 'allowed-transitions'],
  auditLogs:          (id, p?) => ['workflow-instances', id, 'audit-logs', p],
}
```

Hierarchical key structure enables **prefix-based invalidation**: invalidating `['workflow-instances', id]` invalidates all sub-keys (detail, allowed-transitions, audit-logs for that instance). This is used in mutation `onSuccess` callbacks to keep related data in sync without over-invalidating unrelated cache entries.

### 8.3 Code Splitting

The current `App.tsx` uses **static imports** for all page components. This results in a single JavaScript bundle containing all page code. For the current page count (15 pages), this is acceptable — the total bundle size including all Radix UI components, `@xyflow/react`, and `recharts` will be in the 800 KB–1.5 MB range (compressed: ~200–400 KB gzip).

**Recommended improvement — route-based code splitting:** Replace static page imports with `React.lazy()` + `Suspense`:

```typescript
// Replace:
import WorkflowDesignerPage from "@/pages/WorkflowDesignerPage";

// With:
const WorkflowDesignerPage = React.lazy(() => import("@/pages/WorkflowDesignerPage"));
```

`WorkflowDesignerPage` is the largest page (imports `@xyflow/react` — a ~500 KB dependency for the canvas editor). Lazy-loading it means users who only access the instance list and dashboard never download the canvas code. Route-based splitting for all admin pages (`/users`, `/roles`, `/settings`, `/notifications`, `/webhooks`) would further reduce the initial bundle for non-admin users.

Vite automatically creates separate chunk files for each `React.lazy()` import and loads them on demand — no additional build configuration is required.

### 8.4 CDN Strategy

**Static asset delivery:** In a production deployment on Render, static frontend assets (JS bundles, CSS, images, fonts) are served from Render's CDN edge nodes. The Vite build output in `dist/` is deployed as a static site, and Render's CDN handles global distribution.

**Content hashing:** Vite appends content hashes to all output filenames (e.g., `index-BcDeFg12.js`). This enables **infinite cache TTLs** for versioned assets — `Cache-Control: max-age=31536000, immutable` can be safely set on all hashed files. The HTML entry point is served with `Cache-Control: no-cache` so browsers always check for the latest version list.

**API traffic:** API calls from the frontend go directly to the NestJS backend (not through a CDN), preserving the CORS and CSRF cookie semantics required for authentication. Adding a CDN in front of the API for GET requests (definition lists, instance reads) is possible but requires careful invalidation coordination with the server-side Redis cache.

---

## 9. Future Microservice Extraction & Scaling

The modular monolith is explicitly designed to be **microservice-extractable without rewrites**. Every cross-module communication path — contract interfaces (Symbol tokens), NATS events, shadow read models — corresponds directly to the API surface that would become a gRPC/REST endpoint or an event topic boundary between services.

### 9.1 Module Extraction Order (Priority)

Extraction should follow the principle of extracting the module with the **highest independent scaling need** first, preserving the most inter-dependencies in the monolith:

**Phase 1 — Extract `WorkflowExecutionModule` (highest priority)**

This is the busiest module at runtime. Every transition execution, instance read, and allowed-transitions query flows through it. Extracting it as a dedicated service allows independent pod scaling:

```
Before: one monolith pod handles all traffic
After:  WorkflowExecution pod × N  (scale independently)
        Monolith pod × 2          (auth, definition, tenant, admin)
```

Extraction steps:

1. Replace `WORKFLOW_QUERY_CONTRACT` in-process injection with a gRPC client pointing to `WorkflowDefinitionService` — no change in `WorkflowExecutionModule` code.
2. Replace `RULE_ENGINE_CONTRACT` with either an in-process call to a co-located rule engine pod or a gRPC call — no change in `ExecuteTransitionHandler`.
3. The NATS publishers remain unchanged — events are published to the same subjects.
4. `we_user_shadows` table migrates with the service.

**Phase 2 — Extract `NotificationModule`**

Notification delivery (email, webhook) is I/O-bound and highly parallelisable. The module is already fully event-driven — it has no synchronous dependencies on other modules. Extraction requires only pointing its NATS subscriber to the external NATS cluster.

**Phase 3 — Extract `AuditModule`**

The audit module is a pure consumer of NATS events with a single-table write model. It can be extracted as a minimal service (1–2 pods) dedicated to audit log persistence and querying.

**Phase 4 — Extract `RuleEngineModule`**

If rule evaluation becomes a performance bottleneck (e.g., complex custom rules with external lookups), `RuleEngineService` can be extracted as a stateless gRPC service. `ExecuteTransitionHandler` already injects it via `RULE_ENGINE_CONTRACT` — swapping the implementation to a gRPC client requires zero changes to the handler.

**What stays in the monolith (last to extract):** `AuthModule`, `TenantModule`, `WorkflowDefinitionModule`, `DashboardModule`. These modules have lower scaling demands (lower write frequency), more complex inter-dependencies (provisioning, JWT issuance), and benefit from transactional consistency within a single DB.

### 9.2 Database Partitioning Strategy

As data volume grows into hundreds of millions of rows, two high-write tables require partitioning:

**`audit_logs` — Partition by time (monthly)**

Audit logs are append-only, never updated, and queried almost exclusively by time range or by `instance_id`. Monthly partitions enable:

- **Efficient time-range scans:** Queries for "all events in March 2025" touch only one partition rather than scanning a multi-billion-row table.
- **Operational archiving:** Old partitions can be detached and archived to cold storage (S3, Glacier) without touching live data.
- **Partition pruning:** The PostgreSQL query planner automatically skips partitions outside the query's time range.

```sql
-- Declarative partitioning by created_at (monthly)
CREATE TABLE audit_logs (
  -- existing columns
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_2025_03
  PARTITION OF audit_logs
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
```

**`workflow_instances` — Partition by tenant hash (for large-scale deployments)**

For systems with thousands of active tenants, hash-partitioning by `tenant_id` distributes instances evenly across N partitions:

```sql
-- Hash partitioning into 16 buckets
CREATE TABLE workflow_instances (
  -- existing columns
) PARTITION BY HASH (tenant_id);

CREATE TABLE workflow_instances_p0
  PARTITION OF workflow_instances
  FOR VALUES WITH (modulus 16, remainder 0);
-- ... through p15
```

This keeps partition size manageable as tenant count grows and is compatible with the existing `(tenant_id, status)` and `(tenant_id, workflow_definition_id)` composite indexes.

**Combined partitioning:** For extreme scale, `workflow_instances` can use composite partitioning — hash by `tenant_id` at the top level, then range by `created_at` within each hash partition. PostgreSQL 11+ supports this natively.

### 9.3 Multi-Tenant Scaling Strategy

**Noisy-neighbour control (already implemented):**

- Per-tenant leaky-bucket rate limiting (Layer 1: Redis-backed, 1,000 burst/600 rpm)
- Per-user rate limiting (Layer 2: 200 burst/120 rpm)
- ThrottlerGuard as a global memory-based backup

**Hot-tenant isolation — dedicated DB partition (premium tier):**

Large enterprise tenants on the `enterprise` plan (high instance volume, complex definitions) can be migrated to a **dedicated PostgreSQL schema or database** while continuing to access the same API:

```typescript
// Future: DatabaseContextInterceptor selects DataSource based on tenant plan
const dataSource =
  tenantPlan === "enterprise"
    ? (enterpriseDataSourceMap.get(tenantId) ?? defaultDataSource)
    : defaultDataSource;
```

The `TenantModule` already stores the plan in `tenants.plan`. The `TENANT_QUERY_CONTRACT` already exposes `getPlan(tenantId)`. Adding a `dedicatedDbUrl` field to `tenant_settings` and a routing layer in `DatabaseContextInterceptor` enables hot-tenant isolation with minimal application changes. RLS policies remain identical on dedicated databases — isolation becomes physical rather than logical.

**Async processing for notifications/connectors:**

As notification volume grows, move from synchronous-in-subscriber delivery to a **job queue** (e.g., BullMQ on Redis or a dedicated job queue service). The `NotificationSubscriber` enqueues a job rather than delivering immediately — a pool of worker processes handles retries, exponential backoff, and dead-letter queues independently from the main application.

**Caching efficiency for workflow definitions (versioned immutable = maximally cache-friendly):**

Version snapshots are the most cache-friendly data type in the system: once written, they are mathematically guaranteed to never change. They can be cached with `CacheTTL.IMMUTABLE` (24 hours), served from a CDN edge cache, or stored in a distributed in-process LRU cache without any consistency concerns. This property becomes more valuable at scale — a busy tenant running 10,000 active instances against the same definition version needs to read that snapshot exactly once per 24 hours regardless of transition volume.

### 9.4 Service Mesh Considerations

When individual modules are extracted as services, a service mesh (Istio, Linkerd) provides:

- **mTLS between services:** All gRPC calls between extracted modules are automatically encrypted and mutually authenticated without code changes.
- **Traffic policies:** Fine-grained rate limiting, circuit breaking, and retry policies per service-to-service route.
- **Distributed tracing:** Correlation IDs propagated across service calls for end-to-end latency visibility (e.g., time from `POST /transitions` in the execution service to audit record written in the audit service).
- **Canary deployments:** Traffic splitting enables gradual rollout of a new `RuleEngineService` version to 5% of traffic before full promotion.

The existing `LoggingInterceptor` already captures `userId` and `tenantId` on every request — these values can be injected as trace baggage to correlate logs across service boundaries in a distributed tracing system (Jaeger, Tempo).

### 9.5 Event Sourcing Consideration

The current system stores **current state** (the latest `WorkflowInstance` row with `currentStateId` and `status`). The complete history of what happened is captured in `audit_logs`, but `audit_logs` are not designed as a replayable event store — they are a compliance record, not a CQRS event source.

**When event sourcing would be appropriate:** If the product needs to support time-travel queries (reconstruct the exact state of an instance at any historical moment), undo/replay (re-execute transitions from a checkpoint), or event-driven projections (build new read models from historical events), a proper event store should be introduced.

**Migration path:** The NATS event payloads already capture the full transition context (`fromState`, `toState`, `instancePayload`, `performedByUserId`, `comment`, `occurredAt`). Persisting these events to a dedicated event store (e.g., EventStoreDB, or a `instance_events` PostgreSQL table with append-only semantics similar to `audit_logs`) would provide the replayable event log. The `WorkflowInstance` row would then become a materialised projection of the event stream, rebuilt on demand.

**Current recommendation:** Do not introduce event sourcing now. The audit log provides sufficient historical record for compliance and debugging. The complexity cost of event sourcing (eventual consistency, projection rebuilds, versioning event schemas) is not justified until time-travel or replay use cases are explicitly required by product requirements.

---

_Document 08 of 13 — Scalability & Performance Design_  
_Cross-reference: `03-LOW-LEVEL-DESIGN.md` for cache key implementation details, `05-DATABASE-DESIGN.md` for full index catalogue and migration strategy, `07-SECURITY-DESIGN.md` for the rate limiting security model_
