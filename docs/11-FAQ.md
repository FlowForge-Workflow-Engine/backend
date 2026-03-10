---
title: Frequently Asked Questions — Architecture & Design Decisions
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# Frequently Asked Questions — Architecture & Design Decisions

This document answers all 36 mandatory architectural questions defined in Section 7 of the documentation prompt. Every answer follows the pattern: **Decision → Alternatives Considered → Why This Was Chosen → Trade-offs**. Questions are grouped thematically. This document is intended to be self-contained — a new engineer should be able to understand every major technology and architectural choice by reading it in full.

---

## Table of Contents

- [Group A — Backend Technology Stack](#group-a--backend-technology-stack)
  - [Q1: Why Node.js over Golang or Java?](#q1-why-nodejs-over-golang-or-java)
  - [Q2: Why Bun over npm/yarn?](#q2-why-bun-over-npmyarn)
  - [Q3: Why NestJS over Express or Fastify?](#q3-why-nestjs-over-express-or-fastify)
  - [Q4: Why TypeORM over Prisma or Sequelize?](#q4-why-typeorm-over-prisma-or-sequelize)
  - [Q5: Why PostgreSQL over MySQL or MongoDB?](#q5-why-postgresql-over-mysql-or-mongodb)
  - [Q6: Why Redis over Memcached?](#q6-why-redis-over-memcached)
  - [Q7: Why NATS over RabbitMQ or Kafka?](#q7-why-nats-over-rabbitmq-or-kafka)
  - [Q19: Why json-rules-engine over Drools or a custom engine?](#q19-why-json-rules-engine-over-drools-or-a-custom-engine)
- [Group B — Security & Authentication](#group-b--security--authentication)
  - [Q8: Why JWT over OAuth/SAML?](#q8-why-jwt-over-oauthsaml)
  - [Q9: Why Argon2 over Bcrypt or Scrypt?](#q9-why-argon2-over-bcrypt-or-scrypt)
  - [Q11: What is the security model in full?](#q11-what-is-the-security-model-in-full)
- [Group C — Architecture Philosophy](#group-c--architecture-philosophy)
  - [Q10: What is a Microservice-Extractable Contract-First Modular Monolith and why was it chosen?](#q10-what-is-a-microservice-extractable-contract-first-modular-monolith-and-why-was-it-chosen)
  - [Q12: What is the scalability model in full?](#q12-what-is-the-scalability-model-in-full)
  - [Q20: Why REST over GraphQL or gRPC?](#q20-why-rest-over-graphql-or-grpc)
- [Group D — Frontend Technology Stack](#group-d--frontend-technology-stack)
  - [Q15: Why React + Vite over Angular or Vue?](#q15-why-react--vite-over-angular-or-vue)
  - [Q16: Why TailwindCSS over Bootstrap or Materialize?](#q16-why-tailwindcss-over-bootstrap-or-materialize)
  - [Q17: Why TanStack Query + Zustand over Redux or MobX?](#q17-why-tanstack-query--zustand-over-redux-or-mobx)
  - [Q18: Why shadcn/ui over Ant Design or Material-UI?](#q18-why-shadcnui-over-ant-design-or-material-ui)
- [Group E — Deployment & Tooling](#group-e--deployment--tooling)
  - [Q13: Why Docker over Podman or LXC?](#q13-why-docker-over-podman-or-lxc)
  - [Q14: Why GitHub over GitLab or Bitbucket?](#q14-why-github-over-gitlab-or-bitbucket)
- [Group F — Microservice Migration (Q21–Q36)](#group-f--microservice-migration-q21q36)
  - [Q21: Internal communication protocol — NATS or Kafka for microservices?](#q21-internal-communication-protocol--nats-or-kafka-for-microservices)
  - [Q22: API Gateway — Kong, Apigee, Amazon API Gateway, or Custom Fastify?](#q22-api-gateway--kong-apigee-amazon-api-gateway-or-custom-fastify)
  - [Q23: Load Balancer — NGINX, HAProxy, or AWS ALB?](#q23-load-balancer--nginx-haproxy-or-aws-alb)
  - [Q24: Observability — Prometheus, Grafana, Datadog, Sentry, ELK, CloudWatch, New Relic, or X-Ray?](#q24-observability--prometheus-grafana-datadog-sentry-elk-cloudwatch-new-relic-or-x-ray)
  - [Q25: Deployment strategy — CI/CD, Blue-Green, A/B Testing?](#q25-deployment-strategy--cicd-blue-green-ab-testing)
  - [Q26: Managing complexity in a distributed system](#q26-managing-complexity-in-a-distributed-system)
  - [Q27: Ensuring performance after microservice extraction](#q27-ensuring-performance-after-microservice-extraction)
  - [Q28: Ensuring resilience and handling failures](#q28-ensuring-resilience-and-handling-failures)
  - [Q29: Ensuring security in a distributed system](#q29-ensuring-security-in-a-distributed-system)
  - [Q30: Ensuring reliability and high availability](#q30-ensuring-reliability-and-high-availability)
  - [Q31: Ensuring scalability under increased load](#q31-ensuring-scalability-under-increased-load)
  - [Q32: Ensuring maintainability and fast deployment](#q32-ensuring-maintainability-and-fast-deployment)
  - [Q33: Ensuring observability and quick debugging](#q33-ensuring-observability-and-quick-debugging)
  - [Q34: Ensuring testability and quick fixes](#q34-ensuring-testability-and-quick-fixes)
  - [Q35: Ensuring governance and compliance auditability](#q35-ensuring-governance-and-compliance-auditability)
  - [Q36: Ensuring extensibility and handling future changes](#q36-ensuring-extensibility-and-handling-future-changes)

---

## Group A — Backend Technology Stack

### Q1: Why Node.js over Golang or Java?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §5 Tech Stack_

**Decision:** Node.js (via the Bun runtime) is the execution environment for the backend.

**Alternatives considered:**

| Alternative                 | Key Strength                                                                       | Key Weakness for this project                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Golang**                  | Native concurrency (goroutines), low memory footprint, compiled binary performance | No mature DI container comparable to NestJS; building a structured modular monolith with contracts, guards, interceptors, and decorators from scratch in Go is months of framework work, not product work |
| **Java (Spring Boot)**      | Battle-tested for enterprise, rich ecosystem, strong type system, JPA              | JVM startup overhead (1–5 sec cold start) conflicts with Render's container restart model; verbose boilerplate; team velocity slower for a product that needs rapid iteration                             |
| **Python (FastAPI/Django)** | Fast prototyping, strong ML integration                                            | GIL limits true concurrency; performance under sustained load is lower than Node.js; lacks TypeScript's end-to-end type safety across frontend/backend                                                    |

**Why Node.js was chosen:**

The most decisive factor is **TypeScript as a shared language across the full stack**. The frontend (React) and backend (NestJS) are both TypeScript. This means: DTOs defined in the backend can be understood by the frontend team without translation, shared type interfaces in `libs/shared/` are literally imported by both layers, and a developer can context-switch between frontend and backend work without changing mental models or tooling.

Node.js's event loop model is well-matched to this workload — the application is overwhelmingly I/O-bound (PostgreSQL queries, Redis reads, NATS publishes, HTTP responses). CPU-bound operations (Argon2 hashing, rule evaluation) are deliberately kept minimal and bounded by rate limiting.

The NestJS ecosystem provides production-grade, first-party modules for every concern: `@nestjs/jwt`, `@nestjs/cqrs`, `@nestjs/throttler`, `@nestjs/terminus`, `@nestjs/microservices` — all maintained by the same team with consistent patterns.

**Trade-offs accepted:**

- Node.js is single-threaded per process. True horizontal scaling requires multiple pods rather than goroutine-level parallelism. This is accepted — the stateless design makes pod scaling trivial.
- Memory consumption per pod is higher than a compiled Go binary. For the current scale (< 5 pods), this is a non-issue.

---

### Q2: Why Bun over npm/yarn?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §5 Tech Stack_

**Decision:** Bun is both the **package manager** and the **runtime** (replacing npm/yarn + Node.js).

**Alternatives considered:**

| Alternative                | Weakness                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **npm**                    | Slowest install times; `node_modules` structure causes resolution issues with monorepos                                            |
| **yarn (classic / Berry)** | Better than npm but still JS-based tooling; plug-and-play mode has compatibility issues with some NestJS decorators                |
| **pnpm**                   | Fastest npm-compatible package manager; excellent monorepo support — the closest real alternative. Does not offer runtime benefits |

**Why Bun was chosen:**

Bun is not just a package manager — it replaces Node.js as the JavaScript runtime itself. This provides three compounding benefits:

1. **Install speed:** Bun installs packages in seconds where npm/yarn takes minutes. In CI pipelines, this directly reduces feedback loop time. The `Dockerfile` uses `bun install --frozen-lockfile` — deterministic, fast, with lockfile verification.

2. **Runtime performance:** Bun uses WebKit's JavaScriptCore engine rather than V8. For NestJS applications, benchmarks consistently show 20–40% higher HTTP throughput and significantly lower memory overhead compared to Node.js 20 with the same NestJS code. The Dockerfile is simply `FROM oven/bun:1-alpine` — the same code runs on Bun without modification.

3. **Built-in TypeScript execution:** Bun executes TypeScript files natively without a compilation step during development. `bun run src/main.ts` works directly, reducing the `ts-node` / `ts-jest` dependency surface.

**Trade-offs accepted:**

- Bun has a younger ecosystem than Node.js. Edge cases exist with some C++ native addons. For this codebase (Argon2, ioredis, typeorm), compatibility has been verified — all dependencies work on Bun.
- Debugging tooling (memory profilers, CPU flamegraphs) is less mature for Bun than for Node.js. This is mitigated by the structured Winston logging already in place.

---

### Q3: Why NestJS over Express or Fastify?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §5 Tech Stack_

**Decision:** NestJS is the application framework.

**Alternatives considered:**

| Alternative  | Weakness                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Express**  | No structure, no DI, no decorators; building module isolation, guards, interceptors, and pipes from scratch is months of framework work before any product feature ships                                                |
| **Fastify**  | Faster raw HTTP throughput than Express; has a DI plugin (`fastify-di`), but it is not first-class; lacks the NestJS decorator ecosystem; CQRS, microservice transport, and OpenAPI generation require custom solutions |
| **Hono**     | Extremely fast, TypeScript-native; but immature for large monolithic applications with complex DI graphs                                                                                                                |
| **AdonisJS** | Opinionated full-stack framework; does not support the NestJS-style decorator-based architecture; smaller community                                                                                                     |

**Why NestJS was chosen:**

NestJS provides the exact features this architecture requires as **first-class, maintained primitives**:

- **Dependency Injection container:** Module boundaries are enforced by the DI container. `AuthModule` exports only `USER_QUERY_CONTRACT` — the DI system prevents any other module from reaching in and importing `UserRepository` directly.
- **`@nestjs/cqrs`:** `WorkflowExecutionModule` uses CQRS natively — `CommandBus.execute(new ExecuteTransitionCommand(...))` dispatches to `ExecuteTransitionHandler` with zero boilerplate.
- **`@nestjs/microservices` hybrid transport:** The app listens on HTTP and NATS simultaneously via `app.connectMicroservice()`. Switching NATS from embedded to external is a single configuration change.
- **Guards, Interceptors, Filters as global pipeline:** `JwtAuthGuard`, `TenantIsolationGuard`, `RolesGuard`, `ClassSerializerInterceptor`, `GlobalExceptionFilter`, `LoggingInterceptor` are all registered once in `AppModule`. No route-level decoration needed.
- **`@nestjs/swagger`:** OpenAPI documentation is auto-generated from DTOs with `@ApiProperty()` decorators. This is critical for a team where frontend engineers consume backend APIs.

**Trade-offs accepted:**

- NestJS has higher startup time than bare Express/Fastify due to metadata reflection and DI container construction (~200–500 ms). This is irrelevant for a long-running server process.
- Decorator-heavy code can feel boilerplate-heavy to engineers unfamiliar with Angular-style patterns. The learning curve is real — approximately one week for a mid-level engineer to become productive.

---

### Q4: Why TypeORM over Prisma or Sequelize?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §5 Tech Stack_

**Decision:** TypeORM is the ORM and migration engine.

**Alternatives considered:**

| Alternative              | Weakness for this project                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Prisma**               | Schema-first: all entities are defined in `schema.prisma`, not in TypeScript classes. This conflicts with NestJS's decorator-based entity pattern (`@Entity`, `@Column`). Prisma's generated client is not injectable via NestJS's DI system without adapters. Custom SQL (required for the RLS `SET LOCAL` session variable) is less ergonomic. |
| **Sequelize**            | JavaScript-first; TypeScript support via `sequelize-typescript` is a wrapper that lags behind the main library; less TypeScript-native than TypeORM; more opinionated about associations which conflict with the "no cross-module entity imports" constraint                                                                                     |
| **Knex (query builder)** | No ORM features — entities, migrations, and relations must all be hand-managed. Appropriate for tiny projects; adds significant boilerplate for 22 entities with 19 repositories.                                                                                                                                                                |
| **Drizzle ORM**          | Lightweight and TypeScript-native; does not yet have a mature migration system comparable to TypeORM migrations; less ecosystem integration with NestJS                                                                                                                                                                                          |

**Why TypeORM was chosen:**

1. **NestJS-native integration:** `@nestjs/typeorm` provides `TypeOrmModule.forRootAsync()` and `@InjectRepository()` — TypeORM repositories are injectable into services with zero boilerplate.

2. **Decorator-based entity definition:** Entities are TypeScript classes decorated with `@Entity()`, `@Column()`, `@Index()`. The same class is the database table schema and the application domain object — no code duplication between a Prisma schema file and TypeScript interfaces.

3. **Migration control:** TypeORM migrations (`1772830603496-Migration.ts`) are TypeScript files with explicit `up()` and `down()` methods. Every schema change is version-controlled, reviewable, and reversible. The RLS policy migration (`1772830604496-Create-RLS-Policies.ts`) runs raw PostgreSQL that no ORM abstraction could express.

4. **Raw SQL escape hatch:** `DataSource.query(sql, params)` and `EntityManager.query()` are first-class TypeORM APIs. The optimistic-lock `UPDATE workflow_instances SET version = version + 1 WHERE id = $1 AND version = $2` is executed as raw SQL in `ExecuteTransitionHandler` for exact control — TypeORM does not get in the way.

5. **`synchronize: false` in production:** TypeORM never auto-syncs the schema outside of the controlled migration runner. Schema drift is impossible in production.

**Trade-offs accepted:**

- TypeORM has been slower to adopt modern PostgreSQL features than Prisma. Complex query generation can be verbose.
- The `@ManyToOne` / `@OneToMany` relation system tempts engineers to write implicit JOINs. This is deliberately constrained in the codebase — cross-module entity relations are never defined (see Constraint 1 in `AGENT_PROMPT.md`).

---

### Q5: Why PostgreSQL over MySQL or MongoDB?

→ _Primary document: `05-DATABASE-DESIGN.md` §1 Overview_

**Decision:** PostgreSQL is the primary database.

**Alternatives considered:**

| Alternative         | Weakness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MySQL / MariaDB** | No native Row-Level Security (RLS) — the entire multi-tenancy isolation model at the database level would be impossible. No native JSONB type — `workflow_definition_versions.snapshot` and `workflow_instances.payload` would require TEXT columns with application-side parsing, losing indexing and JSONB operator benefits.                                                                                                                                                                   |
| **MongoDB**         | Document model is appropriate for flexible schemas; however, this system has highly relational data (users → roles → permissions, definitions → states → transitions → rules). Joins in MongoDB (aggregation pipeline `$lookup`) are more complex and slower than PostgreSQL relational joins. ACID transactions for the optimistic-lock `UPDATE` in transition execution require multi-document transactions in MongoDB — significantly more complex than PostgreSQL's native transaction model. |
| **CockroachDB**     | Distributed SQL with PostgreSQL wire compatibility; overkill for current scale; higher operational complexity; some PostgreSQL features (row-level security, advisory locks) have compatibility caveats                                                                                                                                                                                                                                                                                           |

**Why PostgreSQL was chosen:**

The decision is driven by three features that are **irreplaceable for this architecture**:

1. **Row-Level Security (RLS):** PostgreSQL's `CREATE POLICY` on `USING (tenant_id = current_setting('app.tenant_id')::uuid)` provides **database-enforced** multi-tenancy isolation. Even if a bug in application code forgets to include `WHERE tenant_id = $1`, the RLS policy blocks cross-tenant data access at the database engine level. No other production-ready relational database offers comparable RLS as a native feature. `FORCE ROW LEVEL SECURITY` is applied to all 19 tenant-scoped tables, including for the `SUPERUSER` role used by migrations.

2. **JSONB:** The `workflow_definition_versions.snapshot`, `workflow_instances.payload`, `transition_rules.rule_definition`, `tenant_settings.branding`, and `workflow_states.metadata` columns all use PostgreSQL's native `JSONB` type — binary JSON with full indexing (GIN), operators (`@>`, `->>`), and type checking. This allows the immutable version snapshot to be a fully typed, queryable document rather than an opaque string blob.

3. **ACID transactions with advisory locks:** The transition execution path performs an atomic `UPDATE ... WHERE version = $expectedVersion` inside a `DataSource.transaction()`. PostgreSQL's MVCC model and row-level locking provide the exact semantics needed for optimistic concurrency without requiring application-level locks.

**Trade-offs accepted:**

- PostgreSQL is more complex to operate than MySQL — more tuning parameters, more intricate replication setup. Managed services (Render Postgres, AWS RDS, Supabase) abstract this complexity sufficiently.
- PostgreSQL's `max_connections` default (100) is lower than MySQL's. PgBouncer is required at high pod counts — addressed in `08-SCALABILITY-PERFORMANCE.md §5.1`.

---

### Q6: Why Redis over Memcached?

→ _Primary document: `08-SCALABILITY-PERFORMANCE.md` §4 Caching_

**Decision:** Redis (`ioredis ^5.10.0`) is the cache and distributed coordination layer.

**Alternatives considered:**

| Alternative                                          | Weakness                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Memcached**                                        | Key-value only; no Lua scripting (required for atomic leaky bucket); no Hash data type (used by rate limit buckets `HMGET/HMSET`); no `SETNX` with TTL in a single atomic command; no pattern-based `SCAN`; no persistence. Every advanced feature the rate limiter and idempotency system requires is absent. |
| **Hazelcast**                                        | In-process distributed cache; Java-native; not appropriate for a Node.js/TypeScript stack                                                                                                                                                                                                                      |
| **DynamoDB (as cache)**                              | Cloud-native; higher latency for sub-millisecond cache reads; cost model is per-request (expensive at high cache volume); no Lua scripting                                                                                                                                                                     |
| **In-process LRU cache (`node-cache`, `lru-cache`)** | No sharing across pods; adding a second pod would split the cache, halving hit rates and breaking distributed locks                                                                                                                                                                                            |

**Why Redis was chosen:**

Redis is chosen because the system requires features far beyond simple get/set caching:

1. **Lua scripting (`EVAL`):** The entire leaky bucket rate limiter runs as an atomic Lua script. Redis executes Lua scripts as a single atomic operation — eliminating the race condition between "read current tokens" and "write decremented tokens" that would exist with separate `GET` + `SET` calls.

2. **Hash data type (`HMGET/HMSET`):** Each rate limit bucket is a Redis Hash with fields `tokens` and `last_refill`. This is more memory-efficient than two separate keys and enables atomic multi-field reads in one round trip.

3. **`SET ... NX EX` (atomic SETNX with TTL):** `RedisService.setNX()` uses `SET key value EX ttlSeconds NX` — a single atomic command that sets the key only if it does not exist, with an expiry. This is the foundation of the distributed idempotency lock in `ExecuteTransitionHandler`.

4. **`SCAN` for pattern-based deletion:** `RedisService.delByPattern()` uses the non-blocking `SCAN` cursor API to find and delete all keys matching a pattern — used for bulk tenant cache invalidation without blocking the Redis server.

5. **Cross-pod consistency:** A single external Redis instance is shared by all pods. Cache keys are tenant-scoped (`wf-auth:{tenantId}:user:{userId}`) — any pod can serve a cache-hit response, and any pod can invalidate a cache entry after a mutation.

**Trade-offs accepted:**

- Redis is an additional infrastructure dependency. On Render, Redis is provisioned as a separate managed service. On local development, `docker-compose.dev.yml` runs Redis in a container.
- Redis data is in-memory. Redis `AOF` or `RDB` persistence should be enabled in production to survive Redis restarts without a cold cache.

---

### Q7: Why NATS over RabbitMQ or Kafka?

→ _Primary document: `08-SCALABILITY-PERFORMANCE.md` §6 Messaging_

**Decision:** NATS (`nats ^2.29.3`) is the inter-module messaging bus.

**Alternatives considered:**

| Alternative                          | Assessment                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RabbitMQ**                         | AMQP-based broker with durable queues, message acknowledgement, dead-letter exchanges. Better than NATS for complex routing topologies and retry queues. However, requires separate broker process, queue/exchange configuration, and adds operational overhead. Overkill for the current 14-event, at-most-once delivery model. |
| **Kafka**                            | See detailed analysis below                                                                                                                                                                                                                                                                                                      |
| **Bull/BullMQ (Redis-backed queue)** | Excellent for job queues with retries, scheduling, and priorities — a good fit for notification delivery. Does not replace a pub/sub event bus for domain event broadcasting across bounded contexts.                                                                                                                            |
| **AWS SQS/SNS**                      | Cloud-native; good durability; higher latency than NATS; tight coupling to AWS; not self-hostable for development                                                                                                                                                                                                                |

**Why Kafka wasn’t chosen (for this product stage) — detailed analysis:**

Kafka is a distributed log platform optimized for **durable, replayable streams** with multiple independent consumer groups and offset management. It’s a great fit when your product needs stream processing, event sourcing/replay, long retention, or analytics pipelines. For this workflow engine’s current integration needs (bounded-context domain-event broadcasting inside a modular monolith), Kafka’s strengths are not required yet, and its operational footprint is higher than necessary:

| Dimension | What Kafka Provides | What This System Needs |
|---|---|---|
| **Throughput** | Very high throughput via partitions and batching | Low-to-moderate event volume across a small set of domain events |
| **Durability / retention** | Durable log with configurable retention; replay from offsets | The durable source of truth is PostgreSQL (state + audit). Event replay is not a primary requirement for correctness. |
| **Consumer groups** | Many consumer groups with independent offsets; reprocessing workflows | A small number of consumers per event (e.g., Audit, Notification); reprocessing is not a core product need today |
| **Broker topology** | Multi-node cluster (KRaft/ZooKeeper historically); operational tuning | Lightweight dev/prod experience; minimal moving parts for early-stage delivery |
| **Latency profile** | Optimized for throughput; batching can add latency | Near-real-time UX expectations for “side effect” integrations (audit visibility, notifications) |
| **Schema ecosystem** | Mature schema tooling (Avro/Protobuf + registry options) | Contract can be enforced with TypeScript interfaces in `libs/shared/src/interfaces/events/` without requiring a separate registry service (at this stage) |
| **Operational cost** | Cluster operations are non-trivial (capacity planning, partitions, upgrades) | Simpler operational model while the event surface is small and evolving |

**When Kafka is the right choice (and should be reconsidered):**

- Multiple downstream systems need **independent replay** and backfills (analytics, ML, compliance exports).
- You need **stream processing** (joins/windows/aggregations) or complex event-driven reporting.
- You require **long retention** of domain events as a first-class product capability.
- You adopt **event sourcing** or treat the event log as a core system of record.

**Why NATS was chosen:**

NATS matches the actual requirements: fire-and-forget event broadcasting, sub-millisecond latency, zero external dependencies for development, and a clean upgrade path to NATS JetStream (persistent, acknowledgement-based delivery) when durability becomes a genuine requirement. The `@EventPattern` subscriber API in NestJS is identical for both core NATS and JetStream — the migration requires only a configuration change.

**Trade-offs accepted:**

- Core NATS provides at-most-once delivery. Messages published during a broker restart are lost. This is acceptable because all subscribers are idempotent and all critical state mutations go through PostgreSQL transactions — a missed NATS event causes a missing audit record, not data corruption.
- NATS has no built-in dead-letter queue. Failed subscriber handlers log the error and discard the message. A future BullMQ integration for notifications would add retry/DLQ capabilities without replacing NATS for event broadcasting.

---

### Q19: Why json-rules-engine over Drools or a custom engine?

→ _Primary document: `03-LOW-LEVEL-DESIGN.md` §5 Workflow Engine_

**Decision:** `json-rules-engine ^7.3.1` is the business rule evaluation library.

**Alternatives considered:**

| Alternative                           | Weakness                                                                                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drools / JBoss Rules**              | Java-only; requires a JVM sidecar process; not compatible with a Node.js runtime; rules authored in DRL syntax (domain-specific language) that requires specialist knowledge                             |
| **Nools**                             | Node.js Rete algorithm implementation; abandoned (last commit 2017); no TypeScript support                                                                                                               |
| **Custom AST engine**                 | Full control; but building a correct, tested, extensible rule evaluation engine from scratch is a significant engineering investment with no product value — it is infrastructure work, not product work |
| **SpEL (Spring Expression Language)** | Java ecosystem only                                                                                                                                                                                      |
| **CEL (Common Expression Language)**  | Go/Java native; Node.js bindings exist but are immature; would require WASM for production use                                                                                                           |

**Why json-rules-engine was chosen:**

1. **JSON AST storage:** Rule definitions are stored as JSONB in `transition_rules.rule_definition`. `json-rules-engine` natively consumes this format — a rule definition read from the database is passed directly to `new Engine().addRule(ruleDef)` without transformation.

2. **Operator richness:** Built-in operators cover all required comparison patterns: `equal`, `notEqual`, `lessThan`, `lessThanInclusive`, `greaterThan`, `greaterThanInclusive`, `in`, `notIn`, `contains`, `doesNotContain`. Combined with `all`/`any`/`not` boolean operators, these express the full range of business rules for workflow transitions.

3. **Stateless per-evaluation:** Each `ConditionEvaluator.evaluate()` call creates a **fresh `new Engine()` instance**. This is intentional — it prevents rule state leaking between concurrent evaluations. The trade-off is ~0.5 ms of object construction overhead per call, which is negligible compared to the DB I/O surrounding it.

4. **Extensibility via custom strategies:** Business logic that cannot be expressed as a JSON AST (e.g., "this transition is only allowed on weekdays between 09:00 and 17:00") is implemented as a named `CustomRuleStrategy` in `CustomRuleEvaluator`. The `RULE_ENGINE_CONTRACT` interface exposes `evaluateRules(rules, context)` — callers never know whether a rule uses the AST engine or a custom strategy.

5. **TypeScript-first:** `json-rules-engine` ships TypeScript types and has active maintenance. The evaluation result is strongly typed — `{ passed: boolean, failedRules: { ruleName: string, reason: string }[] }`.

**Trade-offs accepted:**

- `json-rules-engine` does not support temporal reasoning (CEP — Complex Event Processing) or stateful rules that accumulate history across evaluations. If the product requires "raise an alert if more than 5 transitions occur in 1 minute", a separate event streaming layer would be needed.
- Rule definitions must be serializable to JSON — closures and function references cannot be stored. This is a feature, not a limitation: stored rules are inspectable, versionable in Git, and auditable.

---

## Group B — Security & Authentication

### Q8: Why JWT over OAuth/SAML?

→ _Primary document: `07-SECURITY-DESIGN.md` §2 Auth_

**Decision:** JWT (JSON Web Tokens) with custom `AuthModule` handling issuance and validation.

**Alternatives considered:**

| Alternative                                    | Assessment                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OAuth 2.0 (social login / third-party IdP)** | Appropriate when users authenticate through Google, GitHub, or Microsoft. Adds complexity: redirect flows, token exchange, IdP dependency. For a B2B SaaS where tenants manage their own users, a self-contained auth system is simpler and gives tenants full control. OAuth can be layered on top later as an SSO option. |
| **SAML 2.0**                                   | Enterprise SSO standard; XML-based; high integration overhead; appropriate only when selling to enterprises that mandate SAML with their existing IdP (Okta, ADFS). Not needed for the initial product.                                                                                                                     |
| **Session cookies (server-side sessions)**     | Requires a shared session store (Redis) across pods. Breaks the stateless pod design. JWT eliminates this dependency entirely.                                                                                                                                                                                              |
| **Keycloak / Auth0 / Cognito**                 | Managed identity providers; reduce auth implementation burden; introduce external dependency, cost, and reduced control over the token payload (critical for embedding `tenantId`, `tenantSlug`, `roles`, `plan` in the JWT).                                                                                               |

**Why JWT was chosen:**

JWT access tokens are self-contained: every piece of information needed to process a request — `sub`, `email`, `tenantId`, `tenantSlug`, `roles[]`, `roleIds[]`, `plan`, `firstName` — is embedded in the token and cryptographically signed. Any pod can validate any token using the shared `JWT_SECRET` without a database call. This is the foundation of the stateless horizontal scaling model.

The 15-minute access token expiry limits the blast radius of token theft — a stolen token is useless after 15 minutes. The 7-day refresh token in the database (stored as SHA-256 hash) enables session persistence and revocation. Token rotation on every refresh means a compromised refresh token is detectable (the original is revoked on first use; a second use signals a theft event).

**Trade-offs accepted:**

- JWTs cannot be revoked before expiry (the access token is valid until `exp`). Logout invalidates the refresh token in the database but the 15-minute access token remains technically valid. For this workload, 15 minutes is an acceptable window. If instant revocation is required, a Redis-based JWT blocklist can be added without changing the token format.
- JWT payload is base64-encoded, not encrypted. Sensitive fields (email, roles) are visible if the token is decoded. `HttpOnly` cookie delivery (future enhancement) would prevent JavaScript access, but the current `Authorization: Bearer` header pattern is acceptable for the current threat model.

---

### Q9: Why Argon2 over Bcrypt or Scrypt?

→ _Primary document: `07-SECURITY-DESIGN.md` §2 Auth_

**Decision:** `argon2 ^0.44.0` with `argon2id` variant for password hashing.

**Alternatives considered:**

| Algorithm           | Weakness                                                                                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bcrypt**          | Memory-hard parameter is fixed at 4 KB — designed for hardware (ASIC/GPU) from the 2000s. Modern GPUs can compute ~100,000 bcrypt hashes/second. Bcrypt is still secure with high work factors but is showing its age. Not resistant to GPU-parallel attacks in the way that modern memory-hard functions are. |
| **Scrypt**          | Memory-hard and better than bcrypt. However, it has a more complex parameterisation (`N`, `r`, `p`) that is easy to misconfigure. The `p` parallelisation parameter can accidentally create a weak configuration. Argon2 has cleaner parameterisation.                                                         |
| **PBKDF2**          | NIST-recommended and FIPS-compliant. However, not memory-hard — an attacker with a GPU farm can run PBKDF2 efficiently in parallel. Only appropriate in contexts where FIPS compliance is mandatory.                                                                                                           |
| **SHA-256 (plain)** | Not a password hashing function — not iterated, not salted automatically, not memory-hard. Never acceptable for password storage.                                                                                                                                                                              |

**Why Argon2id was chosen:**

Argon2 won the Password Hashing Competition (PHC) in 2015 — the most rigorous public evaluation of password hashing algorithms ever conducted. `argon2id` is the PHC-recommended variant: it combines the data-independent memory access of `argon2i` (resistant to side-channel attacks) with the data-dependent memory filling of `argon2d` (resistant to GPU cracking).

Argon2's three parameters — memory cost, time cost, and parallelism — can be tuned independently to match the available server hardware. As servers become more powerful, parameters can be increased in the `AuthService.register()` path without changing the algorithm.

The `argon2.verify(storedHash, candidatePassword)` function handles salt extraction automatically — the salt is embedded in the hash string format (`$argon2id$v=19$m=...$t=...$p=...$<salt>$<hash>`), eliminating the need to manage salts separately.

**Trade-offs accepted:**

- Argon2 is CPU and memory intensive by design. Each `argon2.hash()` call during registration and `argon2.verify()` during login consumes ~40 ms and several MB of memory. Combined with the 120-rpm user rate limit, the maximum sustained hashing load is ~2 verifications/second per pod — manageable.
- Argon2 is not FIPS 140-2 certified. For regulated industries (healthcare HIPAA, US federal) that mandate FIPS-compliant algorithms, PBKDF2-HMAC-SHA256 would be required instead.

---

### Q11: What is the security model in full?

→ _Primary document: `07-SECURITY-DESIGN.md` (all sections)_

The security model operates at six distinct layers, each providing independent defence-in-depth:

**Layer 1 — Transport Security**

All traffic is served over HTTPS (TLS 1.2+). The `Helmet` middleware (`helmet ^8.1.0`) sets a comprehensive Content Security Policy, HSTS with `max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` headers on every response.

**Layer 2 — Authentication**

JWT access tokens (15 min, RS256 or HS256 signed with `JWT_SECRET`) validate every authenticated request via `JwtAuthGuard` (global guard in `AppModule`). Refresh tokens are opaque random strings stored as SHA-256 hashes in `refresh_tokens`. Token rotation on refresh means a used token is immediately revoked. Passwords are hashed with Argon2id. Login attempts respond with the same `"Invalid credentials"` message for wrong password, wrong email, or inactive account — preventing user enumeration.

**Layer 3 — CSRF Protection**

The `csurf` middleware (configured in `main.ts`) generates a CSRF token that must be present as both a cookie and a request header. The `X-CSRF-Token` header is verified on every state-changing request. The `api-client.ts` in the frontend fetches the CSRF token before mutations and attaches it automatically. This prevents cross-site request forgery attacks against authenticated sessions.

**Layer 4 — Multi-Tenancy Isolation (dual enforcement)**

`tenant_id` is extracted exclusively from the JWT payload — never from the request body or query parameters. The `TenantIsolationGuard` verifies `request.user.tenantId` is present on every authenticated route. The `DatabaseContextInterceptor` executes `SELECT set_config('app.tenant_id', $1, true)` before every request, activating PostgreSQL Row-Level Security. All 19 tenant-scoped tables have `FORCE ROW LEVEL SECURITY` with `USING (tenant_id = current_setting('app.tenant_id')::uuid)`. Even if application code omits `WHERE tenant_id = $1`, the database engine rejects cross-tenant rows.

**Layer 5 — Authorisation (RBAC)**

`RolesGuard` evaluates the `@Roles(...)` decorator on controllers and handlers. `roles[]` in the JWT is the single source of truth for a user's roles within a request. At transition execution time, `allowedRoleIds` on a `WorkflowTransition` is checked against `actor.roleIds` from the JWT — if `allowedRoleIds` is empty, the transition is open to all authenticated users; if populated, only matching role IDs may execute it.

**Layer 6 — Rate Limiting & Input Validation**

Dual-layer rate limiting (Redis leaky bucket + ThrottlerGuard) prevents brute-force attacks, credential stuffing, and noisy-neighbour abuse. Global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` strips and rejects unexpected request body fields at the NestJS layer. `xss-clean` middleware sanitises all string inputs for XSS payloads. `hpp` (HTTP Parameter Pollution) middleware prevents duplicate query parameter injection.

---

## Group C — Architecture Philosophy

### Q10: What is a Microservice-Extractable Contract-First Modular Monolith and why was it chosen?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §2 Architecture Style_

**The Pattern Explained**

A **Modular Monolith** is a single deployable process (`node main.js`) that internally enforces strict module boundaries — each module owns its own entities, repositories, and services, and communicates with other modules only through explicit, version-stable interfaces.

**Contract-First** means every inter-module communication surface is defined as a TypeScript interface + Symbol token _before_ the implementation is written. The interface lives in `libs/shared/src/interfaces/contracts/`, is independent of any module's internal classes, and is the only thing a consuming module is permitted to depend on.

**Microservice-Extractable** means the module boundaries and communication contracts are designed so that any module can be physically separated into a standalone service — without changing its business logic code — by swapping the in-process contract implementation for a gRPC or HTTP client.

```
TODAY (Modular Monolith):

  WorkflowExecutionModule
       │
       │ @Inject(WORKFLOW_QUERY_CONTRACT)
       ▼
  WorkflowQueryService (in same process)
       │
       ▼
  PostgreSQL

FUTURE (After Extraction):

  WorkflowExecutionService (own pod)
       │
       │ @Inject(WORKFLOW_QUERY_CONTRACT)
       ▼
  WorkflowQueryGrpcClient (same interface, different implementation)
       │
       ▼
  WorkflowDefinitionService (own pod) → PostgreSQL
```

`WorkflowExecutionModule` code is **identical in both topologies**. Only the DI registration changes.

**Why not microservices from day one?**

Microservices solve real problems — independent scaling, independent deployment, polyglot freedom. But they create costs that are disproportionate to the value at early stage:

| Cost                                 | Impact at Day One                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Network latency between services** | Every cross-service call adds 1–10 ms. A transition execution that currently does 3 in-process calls would make 3 network hops.                               |
| **Distributed transactions**         | The optimistic-lock transition UPDATE is currently one PostgreSQL transaction. Across services, it becomes a distributed saga with compensating transactions. |
| **Operational overhead**             | 8 microservices = 8 CI/CD pipelines, 8 Kubernetes deployments, 8 health monitors, 8 log aggregation streams. A 2-person team cannot sustain this.             |
| **Service discovery & API gateway**  | Not needed today; required for microservices. Each adds a new failure mode.                                                                                   |
| **Debugging complexity**             | A bug in a transition requires tracing across 4 services. In the monolith, it is a single stack trace.                                                        |

The Modular Monolith **eliminates all these costs today** while **preserving the ability to extract** when the pain of a specific module's scale justifies the complexity. This is not compromise architecture — it is the correct architecture for a product at this stage.

**Three cross-module communication patterns that make extraction safe:**

| Pattern                               | When to Use                                | How It Works                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **JWT Claims**                        | Data about the current authenticated user  | Read from `request.user` (JWT payload). Zero DB calls. Works identically in monolith and microservice — the JWT travels with every HTTP request.             |
| **Contract Interface (Symbol token)** | Synchronous cross-module lookups           | Module A exports `SYMBOL → Interface`. Module B injects `SYMBOL`. On extraction: swap implementation for gRPC client. Module B code unchanged.               |
| **NATS Events + Shadow Read Model**   | High-frequency cross-module data for joins | Module B maintains a local shadow table synced by NATS events. All queries are single-module SQL. Extraction is transparent — NATS is already inter-process. |

---

### Q12: What is the scalability model in full?

→ _Primary document: `08-SCALABILITY-PERFORMANCE.md` (all sections)_

The scalability model has five dimensions:

**1. Stateless horizontal pod scaling:** The NestJS application holds no in-process state. All shared state lives in PostgreSQL (durable), Redis (cache + locks), and NATS (events). Adding pods requires pointing new instances at the same PostgreSQL/Redis/NATS — no coordination, no state migration, no sticky sessions. Load balancers use round-robin distribution.

**2. Multi-layer caching (23 Redis key patterns):** Four TTL tiers — SHORT (1 min), MEDIUM (5 min), LONG (1 hour), IMMUTABLE (24 hours). Version snapshots (the most-read data in transition execution) are cached with IMMUTABLE TTL and never invalidated. Cache-aside pattern: Redis miss → DB read → Redis populate. Redis failure silently falls back to DB.

**3. Per-tenant rate limiting (leaky bucket):** Each tenant has an isolated bucket (`capacity: 1000, leakRate: 10 tok/sec`). Each user has a nested bucket (`capacity: 200, leakRate: 2 tok/sec`). Implemented as an atomic Lua script on Redis. Prevents noisy-neighbour tenant abuse. `SYSTEM_ADMIN` roles are exempt.

**4. Database performance (optimistic locking + composite indexes):** The optimistic-lock `UPDATE ... WHERE version = $expected` prevents write-write conflicts without database-level locks. Composite indexes on `(tenant_id, status)` and `(tenant_id, workflow_definition_id)` ensure the most common query patterns are O(log n) index scans. `maxQueryExecutionTime: 1000` logs slow queries for proactive performance monitoring.

**5. Async side effects (NATS fire-and-forget):** Audit logging and notifications run asynchronously via NATS events, decoupled from the HTTP response latency. A slow email server or a backlogged audit subscriber never delays a transition API response.

---

### Q20: Why REST over GraphQL or gRPC?

→ _Primary document: `06-API-DESIGN.md` §1 Overview_

**Decision:** REST with JSON over HTTPS is the external API protocol.

**Alternatives considered:**

| Alternative | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GraphQL** | Excellent for data-heavy, client-driven queries with varying field selection (e.g., a dashboard that sometimes needs 3 fields, sometimes 20). For this system, every endpoint returns a well-defined, bounded response shape — the flexibility of GraphQL adds complexity (resolver architecture, N+1 problem with DataLoaders, schema stitching) with no benefit. GraphQL also complicates CSRF protection and file uploads. |
| **gRPC**    | Ideal for internal service-to-service communication (which this system will use on microservice extraction). Not appropriate for browser clients — gRPC requires HTTP/2 and binary framing that browsers cannot consume directly without grpc-web proxies. The external API must be browser-consumable.                                                                                                                       |
| **tRPC**    | Type-safe RPC between TypeScript frontend and backend — eliminates API client boilerplate. Compelling for internal TypeScript-only stacks. However, it creates tight coupling between frontend and backend build pipelines; REST is more portable for potential third-party API consumers and mobile clients.                                                                                                                 |

**Why REST was chosen:**

REST is the lingua franca of web APIs — every HTTP client (browser, mobile app, Postman, curl, third-party integration) speaks it without a code generator or custom client library. OpenAPI (Swagger) documentation is auto-generated from NestJS DTOs via `@nestjs/swagger`, providing a self-documenting API that the frontend team and future API consumers can rely on.

The API follows resource-oriented design: `POST /workflow-instances` creates, `PATCH /workflow-instances/:id/transitions` transitions, `GET /workflow-instances/:id` retrieves. These mappings are intuitive and cacheable at the HTTP layer (GET responses can be CDN-cached).

**Internal communication (future):** gRPC is the correct choice for service-to-service calls after microservice extraction — strongly-typed Protobuf contracts with code generation, low latency, HTTP/2 multiplexing. The `WORKFLOW_QUERY_CONTRACT` interface maps directly to a Protobuf service definition.

---

## Group D — Frontend Technology Stack

### Q15: Why React + Vite over Angular or Vue?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §5 Tech Stack_

**Decision:** React 18 with Vite 5 (`@vitejs/plugin-react-swc`).

**Alternatives considered:**

| Alternative                 | Assessment                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Angular**                 | Full-featured opinionated framework with built-in DI, RxJS-based state, and strict module structure. Appropriate for large enterprise teams. For a SaaS startup with a small frontend team, Angular's learning curve, boilerplate (NgModules, decorators, observables), and compile-step complexity slow iteration velocity. |
| **Vue 3 (Composition API)** | Excellent developer experience; gentler learning curve than React; `<script setup>` syntax is clean. The Vue ecosystem (Pinia, Vue Router, Vite) is mature. The primary reason it was not chosen: the workflow designer requires `@xyflow/react` — a React-only library with no equivalent Vue port of comparable quality.   |
| **SvelteKit**               | Compile-time reactivity with minimal runtime overhead; excellent performance. Ecosystem is smaller — critically, no Svelte port of `@xyflow/react` exists for the workflow canvas editor.                                                                                                                                    |

**Why React + Vite was chosen:**

`@xyflow/react ^12.10.1` is the workflow canvas editor library — it provides the drag-and-drop node/edge canvas for building workflow state graphs. It is React-only, making React a hard dependency for the most differentiating frontend feature.

Vite with `@vitejs/plugin-react-swc` provides near-instant HMR via SWC (Rust-based transpiler) — dramatically improving developer iteration speed. Vite's native ES module dev server means no webpack bundling delay during development.

**Trade-offs accepted:**

- React's unidirectional data flow requires explicit state management for complex shared state (handled by Zustand and TanStack Query). Vue's reactivity system would manage this more automatically.
- React's JSX is more verbose than Vue's single-file components for template-heavy pages.

---

### Q16: Why TailwindCSS over Bootstrap or Materialize?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §5 Tech Stack_

**Decision:** TailwindCSS with `shadcn/ui` components.

**Alternatives considered:**

| Alternative           | Weakness                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bootstrap 5**       | Component-based CSS framework with predefined classes. Produces consistent but generic-looking UIs. Overriding Bootstrap styles requires specificity battles. Large CSS bundle even with PurgeCSS.    |
| **Material UI (MUI)** | React component library implementing Google's Material Design. Opinionated visual language — every application built with MUI looks similar. Theming is complex. Large bundle size (~300 KB gzipped). |
| **Materialize**       | Older library, declining community; last major release 2021; not maintained for React                                                                                                                 |
| **CSS Modules**       | Full control with no framework overhead. Requires naming every class; no design system consistency without a separate token file                                                                      |

**Why TailwindCSS was chosen:**

Tailwind is a utility-first CSS framework — every style is applied as a class directly in the JSX (`className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2"`). This eliminates the context-switching between JSX and CSS files and produces CSS that is easily readable in the component itself. Tailwind's JIT compiler generates only the CSS classes actually used — production CSS bundles are typically 5–15 KB.

Combined with `shadcn/ui` (see Q18), Tailwind provides a complete, accessible, customisable design system without the bundle weight or opinionated visual style of MUI/Bootstrap.

---

### Q17: Why TanStack Query + Zustand over Redux or MobX?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §5 Tech Stack_

**Decision:** TanStack Query (`@tanstack/react-query ^5.83.0`) for server state; Zustand (`^5.0.11`) for client state.

**Alternatives considered:**

| Alternative                  | Assessment                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Redux Toolkit**            | Excellent for complex client-side state with deterministic state transitions. Designed for the era before TanStack Query — 80% of Redux usage is async fetching and caching, which TanStack Query handles with zero boilerplate. Redux adds significant ceremony for the remaining 20% (auth state, UI toggles) where Zustand is simpler. |
| **MobX**                     | Reactive state management with observable objects; less boilerplate than Redux. Implicit reactivity can make data flow hard to trace. Smaller community than Redux/Zustand for React.                                                                                                                                                     |
| **SWR (Vercel)**             | Similar to TanStack Query for server state; smaller feature set (no mutation management, no `prefetchQuery`, less flexible cache key structure).                                                                                                                                                                                          |
| **Context API + useReducer** | Built into React; appropriate for simple global state. Does not provide request deduplication, cache TTLs, background refetching, or the `staleTime`/`gcTime` model that TanStack Query provides out of the box.                                                                                                                          |

**Why TanStack Query + Zustand was chosen:**

State in this application falls into two categories:

1. **Server state** (workflow definitions, instances, users, audit logs): Fetched from the API, cached in the browser, invalidated on mutations. TanStack Query manages all of this — `useQuery`, `useMutation`, cache invalidation via `queryClient.invalidateQueries(['workflow-instances', id])`. The `staleTime: 2 minutes` default means navigating between pages reuses cached data without refetching. Retry policy excludes `401`, `403`, `404` — preventing pointless retries on permission errors.

2. **Client state** (current user session, workflow designer canvas state): Lives only in the browser; never sent to the server as-is. Zustand's minimal API (`create(set => ({ count: 0, inc: () => set(s => ({ count: s.count + 1 })) }))`) handles this without Redux's action/reducer/selector boilerplate. `auth-store.ts` uses Zustand `persist` middleware to survive page refreshes; `workflow-designer-store.ts` uses plain Zustand for ephemeral canvas state.

**Trade-offs accepted:**

- TanStack Query v5 has a different API from v4 (`useQuery` options changed, `onSuccess` callbacks moved). Teams upgrading from older React projects need to be aware of breaking changes.
- Zustand stores are not as structured as Redux Toolkit slices. For large teams, Redux's explicit action types provide better auditability of state changes. For this team size, Zustand's simplicity is the right trade-off.

---

### Q18: Why shadcn/ui over Ant Design or Material-UI?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §5 Tech Stack_

**Decision:** `shadcn/ui` as the component library.

**Alternatives considered:**

| Alternative                     | Weakness                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ant Design (AntD)**           | Comprehensive enterprise component set; opinionated visual style (Chinese design language); very large bundle (~1 MB+ gzipped); harder to customise with TailwindCSS since AntD has its own CSS-in-JS system |
| **Material UI (MUI)**           | See Q16 assessment                                                                                                                                                                                           |
| **Radix UI (primitives only)**  | `shadcn/ui` is built on Radix UI primitives — choosing Radix alone means writing all the styling from scratch                                                                                                |
| **Headless UI (Tailwind Labs)** | Fewer components than shadcn; less active development                                                                                                                                                        |

**Why shadcn/ui was chosen:**

`shadcn/ui` is not a traditional component library — it is a collection of **copy-into-your-codebase** components built on Radix UI primitives and styled with Tailwind. Instead of installing a package that evolves independently of your code, you run `npx shadcn-ui add button` which copies the Button component source into `src/components/ui/button.tsx`.

This approach provides:

1. **Full ownership:** Components are in your repository. Customise them freely — no fighting with third-party CSS-in-JS or overriding nested selectors.
2. **Accessibility via Radix:** All interactive components (dialogs, dropdowns, tooltips, command palettes) are built on Radix UI which implements WAI-ARIA patterns correctly — keyboard navigation, screen reader support, focus management.
3. **Zero runtime dependency:** `shadcn/ui` adds no runtime JavaScript overhead. Components are just TypeScript + Tailwind.
4. **Tailwind-native:** Components use Tailwind utility classes — they inherit the design token system and dark mode switching automatically.

---

## Group E — Deployment & Tooling

### Q13: Why Docker over Podman or LXC?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §6 Deployment_

**Decision:** Docker is the container runtime and build system.

**Alternatives considered:**

| Alternative          | Assessment                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Podman**           | Daemonless OCI-compatible container runtime; rootless by default (better security profile than Docker). Functionally compatible with Docker — `podman build` produces the same image. The ecosystem (Docker Hub, Render's deploy system, GitHub Actions `docker/build-push-action`) is Docker-centric; using Podman adds friction without benefit in a cloud-hosted environment. |
| **LXC / LXD**        | Linux container system operating at a lower level than Docker; manages full OS-level containers rather than application containers; not appropriate for packaging a Node.js application — the tooling, registry integration, and CI/CD ecosystem expect Docker images.                                                                                                           |
| **Nix / Nix Flakes** | Reproducible builds with precise dependency pinning; excellent for elimination of "works on my machine" problems; steep learning curve; not supported by Render's native Docker build system.                                                                                                                                                                                    |

**Why Docker was chosen:**

Docker is the universal standard for application containerisation. The `Dockerfile` is 25 lines — it is readable, maintainable, and understood by any engineer. Render's PaaS detects a `Dockerfile` and builds automatically. GitHub Actions has first-class Docker build/push support. Every engineer's local development environment supports `docker compose up`.

The multi-service local environment (`docker-compose.dev.yml` for PostgreSQL + Redis; embedded NATS) provides instant parity between development and production without manual service installation.

---

### Q14: Why GitHub over GitLab or Bitbucket?

→ _Primary document: `01-SYSTEM-ARCHITECTURE.md` §6 Deployment_

**Decision:** GitHub is the version control and CI/CD platform.

**Alternatives considered:**

| Alternative      | Assessment                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitLab**       | Self-hosted option with tighter CI/CD integration (GitLab CI is more powerful than GitHub Actions for complex pipelines); better built-in container registry. The primary reason not chosen: the open-source community, third-party integrations (Dependabot, CodeQL, Renovate, Snyk), and hiring market familiarity strongly favour GitHub. |
| **Bitbucket**    | Strong Jira integration for teams using Atlassian tooling. Smaller community; GitHub Actions ecosystem (10,000+ marketplace actions) vastly exceeds Bitbucket Pipelines.                                                                                                                                                                     |
| **Azure DevOps** | Enterprise-focused; excellent for Microsoft stack; overkill for an early-stage SaaS; tight Azure vendor lock-in.                                                                                                                                                                                                                             |

**Why GitHub was chosen:**

GitHub Actions provides the CI/CD primitives needed (test → build → deploy to Render) with zero self-hosting. The GitHub ecosystem (Dependabot for automated security updates, CodeQL for static analysis, GitHub Packages for container registry) covers the entire security and release pipeline. The developer hiring pool predominantly uses GitHub — onboarding new engineers is frictionless.

---

## Group F — Microservice Migration (Q21–Q36)

_All questions in this group address the future state: what happens after the Modular Monolith is extracted into microservices. Answers are strategic recommendations based on the current architecture's properties._

---

### Q21: Internal communication protocol — NATS or Kafka for microservices?

→ _Primary document: `10-MIGRATION-GUIDE.md`_

**Recommendation:** NATS JetStream for **async event broadcasting**; gRPC for **synchronous service-to-service calls**.

**NATS JetStream (upgrade from core NATS):** When services are physically separated, core NATS's at-most-once delivery is insufficient — a service restart between a publisher's send and a subscriber's receive would lose the event. JetStream adds durable streams, consumer groups with acknowledgements, and at-least-once delivery. The `@EventPattern` subscriber API in NestJS is identical for core NATS and JetStream — migration is a configuration change.

**gRPC for synchronous calls:** The Contract Interface pattern (`WORKFLOW_QUERY_CONTRACT`, `USER_QUERY_CONTRACT`) maps directly to gRPC service definitions. When `WorkflowExecutionService` calls `workflowQuery.getVersionSnapshot(...)`, this becomes a gRPC `GetVersionSnapshot` RPC call to `WorkflowDefinitionService`. Protobuf schemas replace TypeScript interfaces as the contract language — still strongly typed, binary-efficient, and language-agnostic.

**Kafka is still not justified** at this stage. JetStream provides durable streaming within the NATS ecosystem — it handles the delivery guarantees that motivated Kafka consideration without requiring a separate broker technology, new operational expertise, or a different client library.

---

### Q22: API Gateway — Kong, Apigee, Amazon API Gateway, or Custom Fastify?

→ _Primary document: `10-MIGRATION-GUIDE.md`_

**Recommendation:** **Kong Gateway (open-source)** as the primary recommendation, with **AWS API Gateway** as the cloud-native alternative.

| Option                         | Assessment                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kong (open-source)**         | Nginx-based; plugin ecosystem (rate limiting, JWT validation, request transformation, logging); deployable as a Kubernetes ingress controller; declarative configuration via `deck`; self-hosted. Best fit for teams wanting control without vendor lock-in.                                                          |
| **AWS API Gateway**            | Fully managed; integrates with AWS Cognito, IAM, Lambda, CloudWatch natively; zero operational overhead; usage plans and API keys built-in. Best fit if the stack is already AWS-native. Per-request pricing becomes expensive at high volume.                                                                        |
| **Apigee (Google Cloud)**      | Enterprise-grade; excellent analytics and developer portal; best for large organisations with complex API monetisation needs. Overkill and expensive for a startup.                                                                                                                                                   |
| **Custom Fastify Gateway**     | Full control; no licensing; lowest latency. Requires building rate limiting, auth delegation, request routing, circuit breaking, and health checking from scratch — weeks of engineering work that provides no product value. Not recommended unless the team has specific requirements no existing gateway can meet. |
| **Nginx (reverse proxy only)** | Excellent performance; but not an API gateway — lacks JWT validation, rate limiting, plugin model, and observability features.                                                                                                                                                                                        |

**Kong** is recommended because it is the only option that is both self-hostable (no vendor lock-in) and productively usable out of the box with its plugin library. The JWT authentication plugin can validate tokens before they reach any service — eliminating redundant auth processing in each service. The existing Leaky Bucket rate limiting in the application can migrate to Kong's Rate Limiting plugin, centralising traffic control at the gateway layer.

---

### Q23: Load Balancer — NGINX, HAProxy, or AWS ALB?

→ _Primary document: `10-MIGRATION-GUIDE.md`_

**Recommendation:** **AWS ALB (Application Load Balancer)** if deploying on AWS; **NGINX** for self-hosted or Kubernetes-native deployments.

| Option      | Best For                                                                                                                                                   | Weakness                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **AWS ALB** | AWS-native deployments; managed service with zero operational overhead; native integration with ECS, EKS, Route53, ACM (TLS certificates), WAF, CloudWatch | AWS vendor lock-in; cost at high request volume; less flexible for custom routing logic                                  |
| **NGINX**   | Kubernetes Ingress (via `nginx-ingress-controller`); self-hosted; highly configurable; well-understood by most SRE teams                                   | Requires operational management; configuration is declarative but complex for advanced routing                           |
| **HAProxy** | Extremely high-throughput TCP/HTTP load balancing; better raw throughput than NGINX at very high connection counts; excellent health checking              | Less common for modern Kubernetes deployments; the HTTP/2 and gRPC support requires more configuration than ALB or NGINX |

**For a microservices deployment on Kubernetes (the most likely future topology):** NGINX Ingress Controller manages external traffic, and inter-service load balancing is handled by Kubernetes Service objects (with `kube-proxy` or `cilium`). AWS ALB Ingress Controller is the alternative if the cluster is on EKS.

The existing `trust proxy: 1` setting in `main.ts` ensures correct client IP extraction behind any of these load balancers.

---

### Q24: Observability — Prometheus, Grafana, Datadog, Sentry, ELK, CloudWatch, New Relic, or X-Ray?

→ _Primary document: `10-MIGRATION-GUIDE.md`_

**Recommendation:** A layered stack — **Prometheus + Grafana** for metrics, **Sentry** for error tracking, **OpenTelemetry + Tempo/Jaeger** for distributed tracing, and **Loki** for log aggregation.

| Tool                             | Role                 | Assessment                                                                                                                                                                                                  |
| -------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prometheus + Grafana**         | Metrics & dashboards | Open-source standard; pull-based scraping; Grafana dashboards for pod CPU/memory, request rates, DB pool usage, Redis hit rates, NATS message rates. No per-seat licensing.                                 |
| **Sentry**                       | Error tracking       | Best-in-class for surface-level error aggregation, stack traces, and release tracking. Integrates natively with NestJS via `@sentry/nestjs`. Free tier sufficient for early stage.                          |
| **OpenTelemetry + Tempo/Jaeger** | Distributed tracing  | OpenTelemetry is vendor-neutral — instrumentation code works with any backend (Tempo, Jaeger, Datadog, X-Ray). `TraceId` on every request correlates logs across services. Critical once extraction begins. |
| **Grafana Loki**                 | Log aggregation      | Integrates with the existing Winston JSON logs; cheaper than ELK (index-free, label-based); native Grafana integration for log-metric correlation.                                                          |
| **Datadog**                      | Full-stack APM       | Excellent product; expensive (per-host billing at scale); best if team wants a single commercial platform rather than assembling open-source tools.                                                         |
| **ELK Stack**                    | Log search           | Powerful but operationally heavy (Elasticsearch cluster management); Loki is a simpler alternative for structured log aggregation.                                                                          |
| **AWS CloudWatch / X-Ray**       | AWS-native           | Best if entirely on AWS; X-Ray provides distributed tracing with native Lambda/ECS/RDS integration. Vendor lock-in concern.                                                                                 |
| **New Relic**                    | Full-stack APM       | Similar to Datadog; good APM; per-user pricing model can be expensive.                                                                                                                                      |

**The existing `LoggingInterceptor`** already captures `tenantId`, `userId`, `method`, `url`, and `duration` in structured JSON. Adding an `X-Trace-Id` header at the load balancer and propagating it through NATS event payloads (already includes `eventId`) enables end-to-end request correlation with minimal additional instrumentation.

---

### Q25: Deployment strategy — CI/CD, Blue-Green, A/B Testing?

→ _Primary document: `10-MIGRATION-GUIDE.md`_

**Recommendation:** **Rolling deployments** for the initial microservice phase; **Blue-Green deployments** for high-risk schema migrations; **Canary releases** for gradual traffic shifting after stabilisation.

| Strategy                  | When to Use                                                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rolling deployment**    | Standard releases; replace pods one at a time; zero-downtime for stateless services. The current stateless design (no in-process state) makes rolling deployments safe by default.                                                             |
| **Blue-Green deployment** | Database schema migrations that cannot be backward-compatible; major API version changes. Run old (Blue) and new (Green) environments simultaneously; shift 100% traffic after smoke tests pass; immediate rollback by switching back to Blue. |
| **Canary release**        | Behavioural changes in the execution engine, rule evaluator, or rate limiter. Route 5% of traffic to the canary pod; monitor error rates and latency; promote to 100% or roll back based on metrics.                                           |
| **A/B testing**           | Frontend feature experiments; not a deployment strategy for backend services.                                                                                                                                                                  |

**CI/CD pipeline per service (post-extraction):**

```
Push to feature branch → Run unit tests (vitest / jest)
                       → Run integration tests (test DB)
                       → Build Docker image
                       → Push to container registry

Merge to main         → Run full test suite
                       → Run contract tests (verify contract interfaces)
                       → Build production image
                       → Deploy to staging (rolling)
                       → Run smoke tests
                       → Deploy to production (rolling/canary)
```

Each microservice gets its own `Dockerfile`, its own GitHub Actions workflow, and its own independent deployment cadence. A bug fix in `AuditService` can be deployed without touching `WorkflowExecutionService`.

---

### Q26: Managing complexity in a distributed system

→ _Primary document: `10-MIGRATION-GUIDE.md`_

Complexity in a microservices system is managed through five strategies:

| Strategy                                 | Implementation                                                                                                                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service ownership**                    | Each bounded context (Auth, Tenant, WorkflowDefinition, WorkflowExecution, Audit, Notification, RuleEngine) is owned by one team or one engineer. Ownership means: one team writes, deploys, and on-calls for one service.                    |
| **Contract testing**                     | Pact or a similar consumer-driven contract testing tool validates that the `USER_QUERY_CONTRACT` gRPC interface implemented by `AuthService` matches what `WorkflowExecutionService` expects. Contract tests run in CI before any deployment. |
| **API versioning**                       | All external-facing APIs and inter-service gRPC contracts are versioned (`/v1/`, `/v2/`). Old versions are deprecated with advance notice, not removed immediately.                                                                           |
| **Service catalogue / developer portal** | A Backstage or similar internal developer portal lists all services, their owners, their API contracts, their runbooks, and their SLOs. New engineers find the service catalogue before reading source code.                                  |
| **Strangler Fig pattern**                | Never rewrite a service from scratch. Incrementally extract functionality from the monolith, routing a growing percentage of traffic to the new service while the old module handles the remainder. Roll back is always possible.             |

---

### Q27: Ensuring performance after microservice extraction

→ _Primary document: `10-MIGRATION-GUIDE.md`_

| Risk                                             | Mitigation                                                                                                                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Added network latency per cross-service call** | Replace synchronous cross-service calls with async events where possible. For unavoidable synchronous calls (snapshot lookup), use gRPC (HTTP/2, binary framing, connection multiplexing — significantly lower overhead than REST). |
| **Cache invalidation across services**           | Each service maintains its own Redis cache. On a domain event, the owning service publishes a NATS event; other services subscribe and invalidate their own caches. No cross-service cache sharing.                                 |
| **Database connection exhaustion**               | Each service gets its own connection pool (`max: 20`). Services with lower query rates can use `max: 5`. Total connections scale with actual service count, not with pod count × single pool.                                       |
| **Snapshot read bottleneck**                     | Version snapshots are IMMUTABLE-cached for 24 hours. A `WorkflowDefinitionService` pod receiving 10,000 snapshot reads/hour needs to execute at most 1 DB query per snapshot per 24 hours regardless of request volume.             |
| **Performance regression detection**             | Load test each service independently before extraction completes. Define P99 latency SLOs per service. Sentry + Prometheus alerts on SLO violations.                                                                                |

---

### Q28: Ensuring resilience and handling failures

→ _Primary document: `10-MIGRATION-GUIDE.md`_

| Failure Mode                       | Strategy                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service crash**                  | Kubernetes restarts crashed pods automatically (liveness probe via `/health`). NATS reconnects with `maxReconnectAttempts: -1`.                                            |
| **Service dependency unavailable** | Circuit breaker pattern (e.g., `opossum`) on every gRPC client call. Open circuit returns a cached response or a graceful error — it does not cascade failures.            |
| **Message loss (NATS restart)**    | NATS JetStream provides durable message streams. Subscribers acknowledge messages; unacknowledged messages are redelivered after timeout.                                  |
| **Database slow / unavailable**    | Connection timeout (`connectionTimeoutMillis: 10_000`) returns an error fast. Health probe marks the pod unhealthy; load balancer routes traffic to healthy pods.          |
| **Hot tenant overload**            | Tenant-level rate limiting (already implemented) caps requests at the API gateway layer. For premium tenants, dedicated database partitions eliminate resource contention. |
| **Partial deployment failure**     | Canary deployments limit blast radius. Automatic rollback on error rate threshold breached (Argo Rollouts or Spinnaker can automate this).                                 |

---

### Q29: Ensuring security in a distributed system

→ _Primary document: `10-MIGRATION-GUIDE.md`_

| Security Concern                       | Microservice Strategy                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service identity & mutual auth**     | mTLS between all services via a service mesh (Istio/Linkerd). Each pod has a cryptographically signed certificate. Services only accept connections from other pods with valid cluster certificates.     |
| **JWT validation at gateway**          | Kong's JWT plugin validates tokens at the API gateway before requests reach any service. Services can trust that `X-User-Id`, `X-Tenant-Id`, `X-Roles` headers (set by the gateway) are authenticated.   |
| **Tenant isolation in distributed DB** | Each service maintains its own PostgreSQL schema or database. Cross-service DB access is impossible — there is no shared schema after extraction. RLS policies remain active in each service's database. |
| **Secret management**                  | Move from `.env` files to a dedicated secrets manager (AWS Secrets Manager, HashiCorp Vault, Doppler). Each service retrieves only the secrets it needs. No shared `.env` file contains all secrets.     |
| **Audit log integrity**                | The `AuditService` is the sole writer of `audit_logs`. The PostgreSQL trigger blocking UPDATE/DELETE remains. The service has no API endpoint to modify audit records — only to write and read them.     |
| **Supply chain security**              | Dependabot / Renovate for automated dependency updates. Docker base image scanning (Snyk, Trivy) in CI. SBOM (Software Bill of Materials) generated per release.                                         |

---

### Q30: Ensuring reliability and high availability

→ _Primary document: `10-MIGRATION-GUIDE.md`_

| Strategy                           | Detail                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Minimum 2 replicas per service** | Kubernetes `minReplicas: 2` in all production `Deployment` specs. No single pod is a SPOF.                                                                                                                                                      |
| **Pod Disruption Budgets**         | `PodDisruptionBudget: maxUnavailable: 1` ensures at least one pod is always available during node drain operations (cluster upgrades, spot instance reclamation).                                                                               |
| **Database HA**                    | PostgreSQL in a managed HA configuration (Render Postgres HA, AWS RDS Multi-AZ). Automatic failover to the standby replica within 30–60 seconds.                                                                                                |
| **Redis HA**                       | Redis Sentinel or Redis Cluster. Sentinel provides automatic failover for cache and rate limit state. Rate limit state loss on Redis failover causes a brief window of unconstrained requests — acceptable given the 30-second failover window. |
| **NATS JetStream clustering**      | 3-node NATS cluster with Raft consensus. Quorum-based leader election. Message durability across node failures.                                                                                                                                 |
| **Health probes**                  | Liveness (`/health`) and readiness (`/health/ready`) probes on every service. Readiness probe checks DB + Redis connectivity before accepting traffic.                                                                                          |
| **Multi-AZ deployment**            | Pods distributed across availability zones via Kubernetes topology spread constraints. A single AZ outage does not take down the service.                                                                                                       |

---

### Q31: Ensuring scalability under increased load

→ _Primary document: `10-MIGRATION-GUIDE.md`_

| Scaling Lever                               | Implementation                                                                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Horizontal Pod Autoscaling (HPA)**        | Kubernetes HPA scales pods based on CPU utilisation (target: 70%) or custom metrics (request rate via Prometheus adapter). `WorkflowExecutionService` scales independently from `AuthService`. |
| **Vertical Pod Autoscaling (VPA)**          | Recommends CPU/memory request/limit adjustments based on observed usage. Prevents over-provisioning (cost) and under-provisioning (OOMKilled).                                                 |
| **Database connection pooling (PgBouncer)** | At 20+ pods per service, a PgBouncer sidecar or shared PgBouncer deployment multiplexes connections to prevent PostgreSQL `max_connections` exhaustion.                                        |
| **Read replicas for query-heavy services**  | CQRS query handlers in `WorkflowExecutionService` route to a read replica DataSource. Write commands go to the primary. Read replicas scale independently.                                     |
| **Immutable snapshot cache**                | Version snapshots cached with 24-hour TTL. At 10,000 active instances, the cache eliminates ~9,999 duplicate DB reads per snapshot per day regardless of how many pods are running.            |
| **Database partitioning**                   | Monthly time partitioning on `audit_logs`; hash partitioning on `workflow_instances` by `tenant_id`. Each partition is smaller — index operations are faster and autovacuum is more effective. |
| **CDN for static assets**                   | Frontend static assets (JS, CSS, images) served from CDN edge nodes. API traffic goes directly to the load balancer. Reduces origin server load for static content.                            |

---

### Q32: Ensuring maintainability and fast deployment

→ _Primary document: `10-MIGRATION-GUIDE.md`_

| Practice                              | Detail                                                                                                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mono-repo with service boundaries** | The existing mono-repo (`libs/shared/`, `apps/api/`, `apps/frontend/`) extends naturally — new services are added as `apps/<service-name>/`. Shared code (DTOs, event interfaces, Protobuf definitions) lives in `libs/shared/` and is imported by all services. |
| **Per-service CI/CD**                 | Each service has its own GitHub Actions workflow triggered by changes to its directory. A change in `WorkflowExecutionService` does not trigger a `AuthService` build or deploy.                                                                                 |
| **Database migration ownership**      | Each service owns its own migration files. No service runs another service's migrations. Schema changes are reviewed in the same PR as the code change.                                                                                                          |
| **Trunk-based development**           | Short-lived feature branches merged to `main` frequently (< 1 day). Feature flags control exposure of in-progress features in production — avoids long-running branches that cause merge conflicts and deployment complexity.                                    |
| **Automated dependency updates**      | Dependabot or Renovate creates PRs for dependency updates weekly. Security patches are merged within 24 hours. This prevents the `npm audit` backlog that accumulates on longer release cycles.                                                                  |

---

### Q33: Ensuring observability and quick debugging

→ _Primary document: `10-MIGRATION-GUIDE.md`_

| Concern                           | Tool / Pattern                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Distributed trace correlation** | Every request generates a `traceId` at the API gateway. The `traceId` is propagated through NATS event payloads (`eventId` already serves this role) and gRPC metadata headers. All log lines include `traceId`.               |
| **Structured logging**            | The existing Winston JSON logger (`winstonLoggerConfig`) produces `{ timestamp, level, message, traceId, tenantId, userId, serviceName }`. Loki ingests these logs and Grafana provides cross-service log search by `traceId`. |
| **Metrics per service**           | Each service exposes a `/metrics` Prometheus endpoint (via `@willsoto/nestjs-prometheus`). Standard metrics: HTTP request rate, P99 latency, DB pool active connections, Redis hit/miss ratio, NATS message processing rate.   |
| **Error tracking**                | Sentry captures unhandled exceptions with full stack traces, user context (tenantId, userId), and release version. Error rate alerting triggers on-call notifications.                                                         |
| **Alerting**                      | Grafana Alerting on: error rate > 1%, P99 latency > 1s for 5 minutes, DB pool utilisation > 80%, Redis hit rate < 70%, any service pod crash loop.                                                                             |
| **Runbooks**                      | Each service has a runbook documenting: how to restart it safely, what its health check checks, what to look for when the alert fires, how to roll back a deployment.                                                          |

---

### Q34: Ensuring testability and quick fixes

→ _Primary document: `10-MIGRATION-GUIDE.md`_

| Test Type                           | Strategy                                                                                                                                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit tests (per service)**        | Each service runs its own `vitest` / `jest` unit test suite. Business logic in command handlers and domain services is tested in isolation with mocked repositories and Redis. The existing `@nestjs/testing` utilities make this straightforward. |
| **Integration tests (per service)** | Each service runs against a real PostgreSQL and Redis instance in CI (GitHub Actions services). Migration is applied; tests insert and query real data. These catch RLS policy issues that unit tests with mocked DB cannot.                       |
| **Contract tests**                  | Pact consumer-driven contract tests verify that the gRPC interface implemented by `AuthService` matches what `WorkflowExecutionService` expects. Run in CI before any service deployment.                                                          |
| **End-to-end tests**                | A dedicated `tests/e2e/` suite runs the full request flow via HTTP against a docker-compose environment with all services. Covers the "create tenant → create user → create workflow → execute transition" happy path.                             |
| **Local development parity**        | `docker-compose.dev.yml` runs all infrastructure dependencies locally. Engineers run the full test suite locally before pushing. No "it passes CI but breaks on my machine" scenarios.                                                             |
| **Quick fix deployment**            | Hotfix branches deploy directly to production via the same CI/CD pipeline. The rolling deployment strategy means hotfixes are live within 2–3 minutes of merge. Feature flags can disable a broken feature path without a code deployment.         |

---

### Q35: Ensuring governance and compliance auditability

→ _Primary document: `10-MIGRATION-GUIDE.md`_

| Concern                      | Strategy                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Immutable audit trail**    | The `AuditService` PostgreSQL trigger (`BEFORE UPDATE OR DELETE ... RAISE EXCEPTION`) remains active per service. Audit log rows are written with the `eventId` from the NATS payload — providing an end-to-end traceable record from the HTTP request (which generated the domain event) to the audit log row. |
| **GDPR / data deletion**     | Each service owns its data. A "delete tenant" operation fans out NATS events; each service's subscriber deletes its own tenant-scoped rows. Audit logs are retained per the configured retention policy (partition archiving or TTL-based deletion).                                                            |
| **Access control audit**     | `UserRoles` assignment events are captured in `audit_logs` via `auth.user.roles-updated`. Every role change is traceable to the admin who performed it (`actorEmail`, `actorRole` columns).                                                                                                                     |
| **Change management**        | All schema changes are tracked in TypeORM migration files with PR reviews. All service deployments log the deployer identity and commit SHA in the deployment metadata.                                                                                                                                         |
| **Multi-tenancy compliance** | RLS policies remain on every tenant-scoped table in every service's database. A compliance audit can verify: "is it possible for Tenant A to read Tenant B's data?" — the answer is verifiable at the database policy level, independently of application code.                                                 |
| **Secret rotation**          | Secrets Manager (Vault / AWS Secrets Manager) enables secret rotation without redeployment. Services fetch secrets at startup or via a sidecar agent. `JWT_SECRET` rotation requires a brief period of dual-validation (accept tokens signed by both old and new secret).                                       |

---

### Q36: Ensuring extensibility and handling future changes

→ _Primary document: `10-MIGRATION-GUIDE.md`_

The architecture is designed for extensibility at every layer:

| Extension Point                              | How to Extend                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New workflow rule type**                   | Add a new `CustomRuleStrategy` enum value in `RULE_ENGINE_CONTRACT`, implement the strategy in `CustomRuleEvaluator`. No changes to `ExecuteTransitionHandler`, no database schema changes, no other modules affected.                                                                                  |
| **New NATS event**                           | Add event name to `NatsEvents` enum, add payload interface in `libs/shared/src/interfaces/events/`, create publisher method, create subscriber handler. The event bus is additive — existing subscribers are unaffected.                                                                                |
| **New bounded context (new module/service)** | Define a Contract Interface in `libs/shared/src/interfaces/contracts/`. Implement the service. Register it with a Symbol token. Other modules inject the token. The new module is isolated — it cannot accidentally couple to existing module internals.                                                |
| **New tenant plan tier**                     | Add value to `TenantPlan` enum, update feature flag checks in `TenantQueryService.isFeatureEnabled()`, update JWT payload population in `AuthService`. Feature flags per tenant (`tenant_feature_flags` table) allow granular enablement without code deployment.                                       |
| **New notification channel**                 | Add value to `NotificationChannel` enum, implement the delivery adapter in `NotificationModule`, register a subscriber. Existing email and webhook channels are unaffected.                                                                                                                             |
| **Frontend page or feature**                 | Zustand stores and TanStack Query key factories are independently extensible. New pages are added to `App.tsx` routing; new query key factories to `query-keys.ts`; new Zustand slices to `stores/`. The `shadcn/ui` + Tailwind design system ensures new UI is visually consistent without custom CSS. |

The Contract-First, event-driven architecture ensures that **any single module can evolve independently** — the interfaces between modules are stable even as the implementations change. This is the property that makes the system extensible over its entire lifecycle, not just at initial build time.

---

_Document 11 of 13 — Frequently Asked Questions_  
_All 36 mandatory questions from Section 7 of the documentation prompt are answered in this document._  
_Cross-references: `01-SYSTEM-ARCHITECTURE.md`, `03-LOW-LEVEL-DESIGN.md`, `05-DATABASE-DESIGN.md`, `07-SECURITY-DESIGN.md`, `08-SCALABILITY-PERFORMANCE.md`, `10-MIGRATION-GUIDE.md`_
