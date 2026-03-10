---
title: System Architecture Design Decisions & Philosophies
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# System Architecture Design Decisions & Philosophies

This document explains **why** the system is built the way it is, and justifies each major architectural and technology decision using the format **Decision → Alternatives Considered → Why Chosen → Trade-offs**. It is written for a mid-level engineer joining the project.

## Table of Contents

- [1. System Overview](#1-system-overview)
  - [1.1 Purpose of the System](#11-purpose-of-the-system)
  - [1.2 Core Capabilities](#12-core-capabilities)
  - [1.3 Intended Users & Tenants](#13-intended-users--tenants)
- [2. Architectural Style](#2-architectural-style)
  - [2.1 Microservice-Extractable Contract-First Modular Monolith](#21-microservice-extractable-contract-first-modular-monolith)
  - [2.2 Why Not Microservices From Day One?](#22-why-not-microservices-from-day-one)
  - [2.3 Why Not a Traditional Monolith?](#23-why-not-a-traditional-monolith)
  - [2.4 Theoretical Foundations (Evans + Fowler)](#24-theoretical-foundations-evans--fowler)
- [3. Major Components & Modules](#3-major-components--modules)
  - [3.1 Module Catalogue](#31-module-catalogue)
  - [3.2 Full Directory Structure](#32-full-directory-structure)
  - [3.3 Module Boundary Rules](#33-module-boundary-rules)
- [4. Data Flow](#4-data-flow)
  - [4.1 Request Lifecycle (HTTP request → response)](#41-request-lifecycle-http-request--response)
  - [4.2 Workflow Execution Data Flow](#42-workflow-execution-data-flow)
  - [4.3 Inter-Module Communication (contracts)](#43-inter-module-communication-contracts)
  - [4.4 Event Flow (domain events / NATS)](#44-event-flow-domain-events--nats)
- [5. Technology Stack](#5-technology-stack)
  - [5.1 Backend Stack (with justifications)](#51-backend-stack-with-justifications)
  - [5.2 Frontend Stack (with justifications)](#52-frontend-stack-with-justifications)
  - [5.3 Infrastructure Stack](#53-infrastructure-stack)
- [6. Deployment Architecture](#6-deployment-architecture)
  - [6.1 Containerization Strategy (Docker)](#61-containerization-strategy-docker)
  - [6.2 Service Topology (from docker-compose)](#62-service-topology-from-docker-compose)
  - [6.3 Environment Configuration (.env catalogue)](#63-environment-configuration-env-catalogue)
  - [6.4 Future Microservice Extraction Path](#64-future-microservice-extraction-path)
- [7. Key Design Decisions & Rationale](#7-key-design-decisions--rationale)
  - [7.1 Backend runtime: Node.js (via Bun)](#71-backend-runtime-nodejs-via-bun)
  - [7.2 Package manager/runtime: Bun](#72-package-managerruntime-bun)
  - [7.3 Backend framework: NestJS](#73-backend-framework-nestjs)
  - [7.4 ORM: TypeORM](#74-orm-typeorm)
  - [7.5 Database: PostgreSQL + JSONB + RLS](#75-database-postgresql--jsonb--rls)
  - [7.6 Caching + rate limiting: Redis](#76-caching--rate-limiting-redis)
  - [7.7 Messaging: NATS (and JetStream upgrade path)](#77-messaging-nats-and-jetstream-upgrade-path)
  - [7.8 Auth: JWT + refresh tokens + CSRF](#78-auth-jwt--refresh-tokens--csrf)
  - [7.9 Password hashing: Argon2id](#79-password-hashing-argon2id)
  - [7.10 API style: REST](#710-api-style-rest)
  - [7.11 Frontend: React + Vite](#711-frontend-react--vite)
  - [7.12 Styling: TailwindCSS](#712-styling-tailwindcss)
  - [7.13 Server-state/client-state: TanStack Query + Zustand](#713-server-stateclient-state-tanstack-query--zustand)
  - [7.14 Component system: shadcn/ui (Radix primitives)](#714-component-system-shadcnui-radix-primitives)
  - [7.15 Containerization: Docker](#715-containerization-docker)
  - [7.16 Source control platform: GitHub](#716-source-control-platform-github)
- [Appendix A. Embedded Reference Sections (verbatim)](#appendix-a-embedded-reference-sections-verbatim)

---

## 1. System Overview

### 1.1 Purpose of the System

The platform is a **multi-tenant SaaS workflow engine** that enables B2B tenants to:

- author workflow definitions (states, transitions, rules, role access)
- publish **immutable versioned snapshots** of definitions for deterministic runtime behavior
- create workflow instances and execute transitions with **strong consistency** (atomic state update + audit)
- integrate side effects (audit visibility, notifications/webhooks) via asynchronous domain events

### 1.2 Core Capabilities

| Capability           | What it means in this system                 | Primary modules / surfaces                                                         |
| -------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Tenant onboarding    | Create tenant + first admin in one API call  | `backend/src/modules/auth/` (`POST /api/v1/auth/register/tenant`)                  |
| Identity & access    | JWT auth, refresh token rotation, RBAC roles | `backend/src/modules/auth/`, `libs/shared/src/interfaces/jwt-payload.interface.ts` |
| Workflow design-time | Draft workflow CRUD + version publish        | `backend/src/modules/workflow-definition/`                                         |
| Workflow runtime     | Instance lifecycle + transition execution    | `backend/src/modules/workflow-execution/`                                          |
| Rule evaluation      | Evaluate JSON AST rules against context      | `backend/src/modules/rule-engine/`                                                 |
| Auditability         | Immutable append-only audit log + reads      | `backend/src/modules/audit/`                                                       |
| Notifications        | Email/webhook side effects driven by events  | `backend/src/modules/notification/`                                                |
| Tenant isolation     | App- and DB-enforced tenant boundary         | `backend/src/modules/database/` (RLS context)                                      |

### 1.3 Intended Users & Tenants

| Persona           | Primary actions                                                                    | API/UI touchpoints                                                                           |
| ----------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Tenant Admin      | Onboard tenant, manage users/roles, configure webhooks/templates, author workflows | UI pages under `frontend/src/pages/` (auth, users, roles, workflows, notifications)          |
| Workflow Designer | Build and publish workflows                                                        | `frontend/src/pages/WorkflowDesignerPage.tsx`, `backend/src/modules/workflow-definition/`    |
| Requestor         | Create workflow instances                                                          | `frontend/src/pages/CreateInstancePage.tsx`, `POST /api/v1/workflow-instances`               |
| Approver          | View allowed actions, execute transitions with comment/rules                       | `frontend/src/pages/InstanceDetailPage.tsx`, `GET /allowed-transitions`, `POST /transitions` |
| Auditor/Viewer    | Read instance history/audit                                                        | `GET /api/v1/workflow-instances/:id/audit-logs`                                              |

---

## 2. Architectural Style

### 2.1 Microservice-Extractable Contract-First Modular Monolith

**Decision:** Build as a **Microservice-Extractable Contract-First Modular Monolith**: a single deployable NestJS application with strict internal boundaries and explicit contracts.

**Alternatives considered:**

| Alternative                          | Why it’s attractive                   | Why it’s not chosen here                                                                             |
| ------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Microservices from day one           | Independent scaling + fault isolation | High ops cost early; distributed tracing/auth/network failure modes before product maturity          |
| Traditional monolith (no boundaries) | Fast to ship early                    | Becomes unextractable; cross-module coupling via repositories/entities makes later scaling a rewrite |

**Why chosen:**

- The backend is a single process (simple ops) but **behaves architecturally like a set of services**:
  - cross-module sync calls go through explicit contract tokens (see usage in `backend/src/modules/workflow-execution/handlers/execute-transition.handler.ts` injecting `WORKFLOW_QUERY_CONTRACT` and `RULE_ENGINE_CONTRACT`)
  - cross-module async integration uses **NATS events** with idempotent consumers
  - persistence boundaries are enforced (no cross-module ORM relations as a design rule)
- This preserves **microservice extraction optionality** without paying the full microservices tax on day 1.

**Trade-offs:**

- Boundary discipline must be continuously enforced (code review + linting conventions).
- Some “easy joins” across modules are intentionally avoided; shadow read models may be needed.

### 2.2 Why Not Microservices From Day One?

**Decision:** Start with a modular monolith and plan for extraction via Strangler Fig later.

**Alternatives considered:** microservices-first.

**Why chosen:**

- The system needs strong consistency for transitions; doing this across services requires distributed transactions or sagas, which is heavy early.
- The team ships faster with one codebase/deployable, while still enforcing service-ready boundaries.

**Trade-offs:**

- Independent scaling is coarser until extraction; mitigated by stateless design and externalized state (Postgres/Redis/NATS).

### 2.3 Why Not a Traditional Monolith?

**Decision:** Reject “anything can import anything” monolith patterns.

**Alternatives considered:** a convenience-driven monolith with shared entities, shared repositories, and ad-hoc service calls.

**Why chosen:**

- Traditional monolith coupling makes future extraction and scaling prohibitively costly.
- This domain (workflow execution) benefits from clean bounded contexts (identity, tenancy, design-time, runtime, audit, notification).

**Trade-offs:**

- Adds upfront discipline: contracts, idempotency, explicit data loading.

### 2.4 Theoretical Foundations (Evans + Fowler)

| Source                                 | Concept                               | How it appears in this codebase                                                              |
| -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Eric Evans (DDD)                       | Bounded contexts + published language | Modules under `backend/src/modules/*` with contracts and event payloads in shared interfaces |
| Fowler (Monolith First, Strangler Fig) | Modular monolith first; extract later | Contract-first boundaries and NATS eventing are extraction-friendly                          |

---

## 3. Major Components & Modules

### 3.1 Module Catalogue

| Module                   | Directory                                  | Bounded Context   | Responsibility                                                                     |
| ------------------------ | ------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------- |
| AuthModule               | `backend/src/modules/auth/`                | Identity & Access | Tenant onboarding auth flows, user management, JWT issuance/refresh, RBAC roles    |
| TenantModule             | `backend/src/modules/tenant/`              | Tenancy           | Tenant settings/feature flags/plan + tenancy contracts                             |
| WorkflowDefinitionModule | `backend/src/modules/workflow-definition/` | Workflow Design   | Draft authoring, states/transitions/rules, publish version snapshots               |
| WorkflowExecutionModule  | `backend/src/modules/workflow-execution/`  | Workflow Runtime  | Create instances, execute transitions (CQRS), enforce optimistic locking and rules |
| RuleEngineModule         | `backend/src/modules/rule-engine/`         | Rule Evaluation   | Evaluate JSON AST rules, serve metadata for rule builder UI                        |
| AuditModule              | `backend/src/modules/audit/`               | Compliance        | Append-only audit log, event-driven / query APIs                                   |
| NotificationModule       | `backend/src/modules/notification/`        | Notifications     | Email templates, webhook configs, delivery logs, event subscribers                 |
| DatabaseModule           | `backend/src/modules/database/`            | Infrastructure    | TypeORM bootstrap + RLS context interceptor                                        |
| InfraModule              | `backend/src/infra/`                       | Infrastructure    | Redis client, NATS config, logging, rate limiting middleware                       |
| HealthModule             | `backend/src/modules/health/`              | Observability     | Health/readiness endpoints                                                         |
| DashboardModule          | `backend/src/modules/dashboard/`           | Analytics         | Tenant dashboard aggregation endpoints                                             |

### 3.2 Full Directory Structure

Backend (`backend/src/`) actual top-level structure:

```text
backend/src/
  app.module.ts
  main.ts
  migration-runner.ts
  session-management.ts
  infra/
  modules/
    audit/
    auth/
    dashboard/
    database/
    health/
    notification/
    rule-engine/
    tenant/
    workflow-definition/
    workflow-execution/
```

Frontend (`frontend/src/`) actual top-level structure:

```text
frontend/src/
  App.tsx
  main.tsx
  pages/
  components/
    auth/
    common/
    layout/
    ui/
  stores/
  lib/
  hooks/
  types/
  utils/
  test/
  index.css
```

### 3.3 Module Boundary Rules

**Non-negotiable boundary rules (enforced by design):**

- No module imports another module’s **entities** or **repositories**.
- Cross-module synchronous calls are via **contract tokens** defined in shared interfaces (e.g., `WORKFLOW_QUERY_CONTRACT`, `RULE_ENGINE_CONTRACT`).
- Cross-module asynchronous integration is via **NATS domain events**.
- Tenant isolation is enforced both at the app layer (guards/interceptors) and at the DB layer (RLS).

---

## 4. Data Flow

### 4.1 Request Lifecycle (HTTP request → response)

Representative lifecycle for an authenticated, tenant-scoped request:

| Step | Component              | What happens                                                          | Code anchors                                                                |
| ---- | ---------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | Client                 | Adds `Authorization: Bearer <JWT>` and CSRF header for mutating calls | `frontend/src/lib/api-client.ts`                                            |
| 2    | Nest bootstrap         | Global pipes, guards, interceptors registered; microservices started  | `backend/src/main.ts`                                                       |
| 3    | JWT auth guard         | Validates JWT signature/expiry, populates `request.user`              | `backend/src/modules/auth/` + shared JWT payload interface                  |
| 4    | Tenant isolation       | Ensures tenant context is present/valid for tenant-scoped APIs        | `backend/src/modules/tenant/` guards (design), plus DB enforcement (RLS)    |
| 5    | DB context interceptor | Sets per-request DB session settings used by RLS (`app.tenant_id`)    | `backend/src/modules/database/interceptors/database-context.interceptor.ts` |
| 6    | Controller → service   | Controller calls application service, not repository directly         | `backend/src/modules/*/controllers/*.ts`                                    |
| 7    | Persistence            | TypeORM queries run tenant-scoped due to RLS session context          | `backend/src/modules/database/` + migrations enabling RLS                   |
| 8    | Response               | Standard response envelope for most endpoints                         | OpenAPI: `backend/OPEN_API_SPEC.json`                                       |

### 4.2 Workflow Execution Data Flow

Transition execution path is designed to be **strongly consistent** and **retry-safe**:

| Step | What happens                 | API / Action                                                                                                         | Primary code anchors                                                                  |
| ---- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1    | Client discovers actions     | `GET /api/v1/workflow-instances/:id/allowed-transitions`                                                             | `backend/src/modules/workflow-execution/controllers/workflow-execution.controller.ts` |
| 2    | Client executes a transition | `POST /api/v1/workflow-instances/:id/transitions` with `transitionId`, `lastKnownVersion`, optional `idempotencyKey` | `backend/src/modules/workflow-execution/dto/execute-transition.dto.ts`                |
| 3    | CQRS command handler runs    | Validates idempotency + optimistic lock (`version`) + role access + comment requirement                              | `backend/src/modules/workflow-execution/handlers/execute-transition.handler.ts`       |
| 4    | Snapshot pinned execution    | Loads immutable published definition snapshot for `definitionVersion`                                                | `WORKFLOW_QUERY_CONTRACT` injection in `ExecuteTransitionHandler`                     |
| 5    | Rule evaluation              | Evaluates JSON AST rules against `{ payload, user, instance }` context                                               | `RULE_ENGINE_CONTRACT` injection in `ExecuteTransitionHandler`                        |
| 6    | Atomic persistence           | Updates instance state and increments version; writes audit record; commits                                          | `DataSource` transaction usage in handler/service layer                               |
| 7    | Event emission               | Publishes domain event for side effects (audit/notification)                                                         | `backend/src/modules/workflow-execution/publishers/execution.publisher.ts`            |
| 8    | Asynchronous side effects    | Subscribers process events idempotently                                                                              | `backend/src/modules/audit/subscribers/audit.subscriber.ts`, notification subscribers |

### 4.3 Inter-Module Communication (contracts)

**Decision:** Contract interfaces are defined in a shared location and injected via symbol tokens.

**Example (from execution):**

- `ExecuteTransitionHandler` depends on:
  - `IWorkflowQueryContract` via `WORKFLOW_QUERY_CONTRACT`
  - `IRuleEngineContract` via `RULE_ENGINE_CONTRACT`

This preserves extraction ability: when a module becomes a microservice, the contract implementation swaps from in-process class to network client (gRPC/HTTP), without changing the consumer’s code.

### 4.4 Event Flow (domain events / NATS)

**Decision:** Use NATS for event broadcasting between bounded contexts for side effects and read-model sync.

**How it works in this system:**

- Publishers in each module publish to NATS subjects (e.g., workflow execution completed)
- Subscribers use `@EventPattern(...)` handlers
- Consumers are designed to be idempotent; message loss is acceptable for non-critical side effects, with a JetStream upgrade path for durability when needed

Code anchors:

- NATS client config: `backend/src/infra/nats.config.ts`
- Publishers: `backend/src/modules/*/publishers/*.publisher.ts`
- Subscribers: `backend/src/modules/audit/subscribers/audit.subscriber.ts` (and others)

---

## 5. Technology Stack

### 5.1 Backend Stack (with justifications)

| Technology            | Decision                      | Alternatives considered                   | Why chosen                                                                              | Code anchors                                                |
| --------------------- | ----------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Runtime               | Node.js semantics via **Bun** | Go, Java, Python                          | High dev velocity + strong ecosystem; aligns with TypeScript end-to-end                 | `backend/package.json`, `backend/Dockerfile`                |
| Framework             | **NestJS**                    | Express, Fastify                          | Modular architecture + DI + guards/interceptors + CQRS support                          | `backend/src/app.module.ts`                                 |
| Language              | **TypeScript**                | JavaScript                                | Strong typing across backend/frontend; safer contracts                                  | `backend/tsconfig.json` (implied), shared interfaces        |
| ORM                   | **TypeORM**                   | Prisma, Sequelize                         | Flexible mapping + migrations; supports patterns needed for modular monolith boundaries | `backend/src/modules/database/*`                            |
| DB                    | **PostgreSQL**                | MySQL, MongoDB                            | ACID + JSONB + Row Level Security for tenant isolation                                  | migrations under `backend/src/modules/database/migrations/` |
| Cache / Rate limiting | **Redis**                     | Memcached                                 | Lua scripting + atomic locks + hashes for leaky bucket                                  | `backend/src/infra/redis.service.ts`                        |
| Messaging             | **NATS**                      | RabbitMQ, Kafka                           | Simple pub/sub for bounded contexts; JetStream upgrade path                             | `backend/src/infra/nats.config.ts`, `backend/start.sh`      |
| Rule engine           | **json-rules-engine**         | Drools, custom AST, expression evaluators | JSON AST stored in DB; safe evaluation without code execution                           | `backend/package.json`, `backend/src/modules/rule-engine/*` |

### 5.2 Frontend Stack (with justifications)

| Technology           | Decision              | Alternatives considered | Why chosen                                      | Code anchors                                      |
| -------------------- | --------------------- | ----------------------- | ----------------------------------------------- | ------------------------------------------------- |
| UI framework         | **React**             | Angular, Vue            | Component ecosystem + strong TypeScript support | `frontend/package.json`, `frontend/src/App.tsx`   |
| Build tool           | **Vite**              | CRA, Webpack            | Fast dev server + modern bundling defaults      | `frontend/package.json`                           |
| Styling              | **TailwindCSS**       | Bootstrap, Materialize  | Design velocity + consistent tokenized styles   | `frontend/package.json`, `frontend/src/index.css` |
| Server state         | **TanStack Query**    | Redux async, SWR        | Cache + invalidation + retries                  | `frontend/src/lib/query-client.ts`                |
| Client state         | **Zustand**           | Redux, MobX             | Small API surface + persisted auth store        | `frontend/src/stores/auth-store.ts`               |
| Component primitives | **shadcn/ui + Radix** | Ant Design, MUI         | Accessible primitives + full styling control    | `frontend/src/components/ui/*`                    |

### 5.3 Infrastructure Stack

| Component      | Decision                            | Alternatives considered | Why chosen                                     | Notes                                                                         |
| -------------- | ----------------------------------- | ----------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| Containers     | Docker                              | Podman, LXC             | Standard ecosystem + build/deploy portability  | See §6.1                                                                      |
| Database       | Managed PostgreSQL                  | Self-hosted PG          | Operational simplicity; durability guarantees  | Enforced tenant isolation via RLS migrations                                  |
| Cache          | Managed Redis                       | Self-hosted Redis       | Shared state across pods; atomic scripts/locks | Rate limiting + idempotency locks                                             |
| Messaging      | NATS (embedded now, external later) | RabbitMQ, Kafka         | Simple pub/sub now; upgrade to JetStream later | Embedded `nats-server` started by `backend/start.sh`                          |
| Source control | GitHub                              | GitLab, Bitbucket       | Industry standard; ecosystem integrations      | [ASSUMPTION: The repo is hosted on GitHub; this workspace is not a git repo.] |

**Mandatory technology questions coverage (Q1–Q19):**

|   # | Question                                                                                                                      | Where answered in this document                                                   |
| --: | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
|   1 | Why Node.js over Golang or Java for this backend?                                                                             | §7.1                                                                              |
|   2 | Why Bun over npm/yarn as package manager and runtime?                                                                         | §7.2                                                                              |
|   3 | Why NestJS over Express or Fastify?                                                                                           | §7.3                                                                              |
|   4 | Why TypeORM over Prisma or Sequelize?                                                                                         | §7.4                                                                              |
|   5 | Why PostgreSQL over MySQL or MongoDB?                                                                                         | §7.5 (and summarized in §5.1)                                                     |
|   6 | Why Redis over Memcached or other NoSQL caches?                                                                               | §7.6 (and summarized in §5.1)                                                     |
|   7 | Why NATS over RabbitMQ or Kafka?                                                                                              | §7.7 (and summarized in §4.4)                                                     |
|   8 | Why JWT over OAuth/SAML for authentication?                                                                                   | §7.8                                                                              |
|   9 | Why Argon2 over Bcrypt or Scrypt?                                                                                             | §7.9                                                                              |
|  10 | What is a Microservice-Extractable Contract-First Modular Monolith and why was it chosen? Why not microservices from day one? | §2.1–§2.2                                                                         |
|  11 | Explain the security model in full detail                                                                                     | Summarized in §4.1 and §7.8–§7.9; full details live in `07-SECURITY-DESIGN.md`    |
|  12 | Explain the scalability model in full detail                                                                                  | Summarized in §6.4 and §7.7; full details live in `08-SCALABILITY-PERFORMANCE.md` |
|  13 | Why Docker over Podman or LXC?                                                                                                | §6.1 / §7.15                                                                      |
|  14 | Why GitHub over GitLab or Bitbucket?                                                                                          | §7.16                                                                             |
|  15 | Why React + Vite over Angular or Vue?                                                                                         | §7.11                                                                             |
|  16 | Why TailwindCSS over Bootstrap or Materialize?                                                                                | §7.12                                                                             |
|  17 | Why TanStack Query + Zustand over Redux or MobX?                                                                              | §7.13                                                                             |
|  18 | Why shadcn/ui over Ant Design or Material-UI?                                                                                 | §7.14                                                                             |
|  19 | Why json-rules-engine over Drools, JBoss Rules, or a custom AST-based engine?                                                 | Summarized in §5.1; deep rationale lives in `03-LOW-LEVEL-DESIGN.md`              |

---

## 6. Deployment Architecture

### 6.1 Containerization Strategy (Docker)

**Decision:** Containerize backend using Docker.

**Alternatives considered:** Podman, LXC.

**Why chosen:**

- The backend Dockerfile uses `oven/bun:1-alpine` for a minimal base and predictable Bun runtime (`backend/Dockerfile`).
- The container installs and runs `nats-server v2.12.0` inside the image for early-stage deployment simplicity (`backend/Dockerfile`, `backend/start.sh`).

**Trade-offs:**

- Embedded NATS simplifies early environments but is not suitable for multi-pod scaling; see §6.4.

### 6.2 Service Topology (from docker-compose)

The `docker-compose.yml` at the repository root defines a **four-service topology**:

| Service    | Image / Build                   | Purpose                                                      | Exposed Ports                        |
| ---------- | ------------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| `postgres` | `postgres:16-alpine`            | Primary transactional database for all modules               | `5432`                               |
| `redis`    | `redis:7-alpine`                | Cache, rate limiting buckets, idempotency locks              | `6379`                               |
| `nats`     | `nats:2.12`                     | External NATS server (JetStream-ready) for pub/sub messaging | `4222` (client), `8222` (monitoring) |
| `backend`  | Built from `backend/Dockerfile` | NestJS modular monolith application (Bun runtime)            | `10000`                              |

Key wiring decisions in `docker-compose.yml`:

- All services share a single bridge network `wf-net` for container-to-container DNS (e.g., `postgres`, `redis`, `nats`).
- The backend service:
  - is built from `./backend/Dockerfile`
  - uses `env_file: ./backend/.env.stage.dev` for defaults
  - overrides DB/Redis/NATS connection hosts to container names:
    - `DB_HOST=postgres`, `DB_PORT=5432`
    - `REDIS_URL=redis://redis:6379`
    - `NATS_URL=nats://nats:4222`
  - exposes `PORT=10000` to the host as `10000:10000`.
- `postgres` and `redis` both have persistent named volumes (`postgres_data`, `redis_data`) and simple health checks; `backend` waits for `postgres` and `redis` to be ready before starting.

> In local development, the backend can also run with its **embedded NATS server** from `backend/start.sh`; in `docker-compose.yml`, the separate `nats` container demonstrates the topology used when NATS is externalized for multi-pod or multi-service deployments.

### 6.3 Environment Configuration (.env catalogue)

Environment sources in this workspace:

- `backend/.env.stage.dev`
- `frontend/.env.production`

**Backend env var catalogue (names only; values intentionally redacted):**

| Category         | Variables                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime          | `NODE_ENV`, `STAGE`, `PORT`, `APP_NAME`, `LOG_LEVEL`                                                                                                         |
| PostgreSQL       | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DATABASE`, `DB_SSL_ENABLED`, `DB_SSL_REJECT_UNAUTHORIZED`, `DATABASE_URL` (optional)                        |
| Redis            | `REDIS_URL`                                                                                                                                                  |
| JWT/Auth         | `JWT_SECRET`, `JWT_EXPIRES_IN`, `EXPIRES_IN`, `JWT_REFRESH_EXPIRY_DAYS`, `SESSION_SECRET`                                                                    |
| Rate limiting    | `THROTTLE_TTL`, `THROTTLE_LIMIT`                                                                                                                             |
| Email            | `EMAIL_USERNAME`, `EMAIL_PASSWORD`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| NATS             | `NATS_URL`                                                                                                                                                   |
| OAuth (optional) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                                                                                   |
| Frontend URL     | `FR_BASE_URL`                                                                                                                                                |
| AWS (optional)   | `AWS_REGION`, `AWS_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY`, `AWS_SECRET_NAME`, `AWS_PUBLIC_BUCKET_NAME`                                                         |

**Frontend env var catalogue:**

| Category    | Variables           |
| ----------- | ------------------- |
| Backend API | `VITE_API_BASE_URL` |

### 6.4 Future Microservice Extraction Path

**Decision:** Preserve extraction readiness by enforcing contracts/events now.

**Likely service candidates when extracting:**

| Service                        | Extracted from module(s)                   | Responsibility                                |
| ------------------------------ | ------------------------------------------ | --------------------------------------------- |
| Auth Service                   | `backend/src/modules/auth/`                | Identity, JWT issuance/refresh, RBAC          |
| Tenant Service                 | `backend/src/modules/tenant/`              | Tenant settings/plan/feature flags            |
| Workflow Definition Service    | `backend/src/modules/workflow-definition/` | Draft authoring + publish snapshots           |
| Workflow Execution Service     | `backend/src/modules/workflow-execution/`  | Instance lifecycle + transition execution     |
| Rule Engine Service (optional) | `backend/src/modules/rule-engine/`         | Stateless rule evaluation (or remain library) |
| Audit Service                  | `backend/src/modules/audit/`               | Immutable audit writes/reads                  |
| Notification Service           | `backend/src/modules/notification/`        | Email/webhook delivery with retries/DLQ       |

This maps directly to the system’s bounded contexts and aligns with the Strangler Fig approach: extract the highest-throughput or highest-change module first (typically execution).

---

## 7. Key Design Decisions & Rationale

> This section explicitly answers the mandatory technology questions that belong in the Architecture document, and summarizes the rationale in the required format.

### 7.1 Backend runtime: Node.js (via Bun)

**Decision:** Use Node.js ecosystem semantics (TypeScript) for the backend, executed via Bun in container/runtime.

**Alternatives considered:** Golang, Java.

**Why chosen:**

- End-to-end TypeScript across backend and frontend reduces contract drift.
- NestJS + CQRS + decorators/guards are mature in the Node ecosystem.

**Trade-offs:**

- CPU-heavy workloads may require careful optimization or offloading to workers; mitigated by async design and scaling strategy.

### 7.2 Package manager/runtime: Bun

**Decision:** Use Bun (`oven/bun` image; `bun install`, `bun run`) for install/build/start in container.

**Alternatives considered:** npm, yarn.

**Why chosen:**

- Faster installs and a unified runtime/package manager.
- Fits the containerized workflow (`backend/Dockerfile`).

**Trade-offs:**

- Some Node ecosystem tooling assumes Node; production script includes a Node path as fallback (`backend/package.json` has `start:prod`).

### 7.3 Backend framework: NestJS

**Decision:** Use NestJS for modular monolith structure + DI + CQRS.

**Alternatives considered:** Express, Fastify.

**Why chosen:**

- Module boundaries map cleanly to DDD bounded contexts.
- Guards/interceptors provide consistent enforcement of auth/tenant context.

**Trade-offs:**

- Slightly more framework surface area than minimalist frameworks; pays off in maintainability.

### 7.4 ORM: TypeORM

**Decision:** Use TypeORM for persistence mapping and migrations.

**Alternatives considered:** Prisma, Sequelize.

**Why chosen:**

- Works well with explicit entity mappings and migration-driven schema evolution.
- Fits the “no cross-module ORM relations” rule by allowing explicit loading patterns.

**Trade-offs:**

- Requires discipline to avoid implicit relations and to keep queries predictable under RLS.

### 7.5 Database: PostgreSQL + JSONB + RLS

**Decision:** PostgreSQL is the source of truth; JSONB is used for snapshots/rules/payloads; tenant isolation is enforced via RLS.

**Alternatives considered:** MySQL, MongoDB.

**Why chosen:**

- ACID guarantees for transition correctness.
- JSONB supports snapshot storage and rule AST storage without a separate document store.
- RLS provides defense-in-depth tenant isolation independent of app code.

**Trade-offs:**

- Requires careful indexing and RLS-aware query patterns; addressed in DB design doc.

### 7.6 Caching + rate limiting: Redis

**Decision:** Use Redis for cache-aside reads, leaky bucket rate limiting, and idempotency locks.

**Alternatives considered:** Memcached.

**Why chosen:**

- Lua scripting + atomic operations are required for correct rate limiting and locking.
- Shared Redis supports horizontal scaling without sticky sessions.

**Trade-offs:**

- Extra dependency; the system must degrade gracefully on cache outages.

### 7.7 Messaging: NATS (and JetStream upgrade path)

**Decision:** Use NATS for pub/sub domain events and side effects; plan JetStream when durable delivery is required.

**Alternatives considered:** RabbitMQ, Kafka.

**Why chosen:**

- Low operational footprint and low latency for the current event surface.
- Clear migration path to JetStream for at-least-once delivery.

**Trade-offs:**

- Core NATS is at-most-once; message loss is acceptable for non-critical side effects (audit visibility/notifications), and consumers are idempotent.

### 7.8 Auth: JWT + refresh tokens + CSRF

**Decision:** JWT bearer tokens for auth + refresh token rotation; CSRF token endpoint for browser safety.

**Alternatives considered:** OAuth/SAML for primary auth.

**Why chosen:**

- B2B tenant-controlled users fit first-party auth; JWT embeds tenant context and roles for low-latency authorization decisions.

**Trade-offs:**

- Access token revocation is limited until expiry; mitigated by short TTL and refresh rotation.

### 7.9 Password hashing: Argon2id

**Decision:** Use Argon2id for password hashing.

**Alternatives considered:** bcrypt, scrypt.

**Why chosen:**

- Modern memory-hard hashing reduces GPU brute-force feasibility.

**Trade-offs:**

- Higher compute cost; acceptable for auth endpoints with rate limiting.

### 7.10 API style: REST

**Decision:** External API is REST, versioned under `/api/v1`.

**Alternatives considered:** GraphQL, gRPC.

**Why chosen:**

- Resource + command-style endpoints map cleanly to workflow operations and have excellent tooling (OpenAPI).

**Trade-offs:**

- Some client aggregations may require BFF endpoints later (aggregator pattern).

### 7.11 Frontend: React + Vite

**Decision:** React + Vite.

**Alternatives considered:** Angular, Vue.

**Why chosen:** ecosystem maturity + TypeScript ergonomics + build performance.

**Trade-offs:** requires deliberate patterns to avoid state sprawl; addressed with TanStack Query + Zustand.

### 7.12 Styling: TailwindCSS

**Decision:** TailwindCSS.

**Alternatives considered:** Bootstrap, Materialize.

**Why chosen:** rapid iteration + composable design tokens.

**Trade-offs:** utility-class learning curve; mitigated by component primitives.

### 7.13 Server-state/client-state: TanStack Query + Zustand

**Decision:** TanStack Query for server state, Zustand for client/UI/auth state.

**Alternatives considered:** Redux, MobX.

**Why chosen:** best-of-breed cache/invalidation for server state; minimal client store for auth and UI.

**Trade-offs:** requires consistent query key strategy; centralized in `frontend/src/lib/query-keys.ts`.

### 7.14 Component system: shadcn/ui (Radix primitives)

**Decision:** shadcn/ui components built on Radix primitives.

**Alternatives considered:** Ant Design, Material UI.

**Why chosen:** accessibility + full styling control with Tailwind.

**Trade-offs:** more assembly work than a full design system; pays off in custom UX.

### 7.15 Containerization: Docker

**Decision:** Docker as the packaging and deployment unit.

**Alternatives considered:** Podman, LXC.

**Why chosen:** standard tooling and compatibility across environments.

**Trade-offs:** none unique; standard container operational practices apply.

### 7.16 Source control platform: GitHub

**Decision:** GitHub as the source control and collaboration platform.

**Alternatives considered:** GitLab, Bitbucket.

**Why chosen:** ecosystem, developer familiarity, integrations.

**Trade-offs:** org-specific; can be swapped if needed.

---

### 7.17 Non-Functional Requirements + SLAs

#### 1. Consistency

- Type: Strong consistency for state transitions (you cannot be in two states at once)
- Mechanism: PostgreSQL ACID transactions + optimistic locking (version column on instances)
- Concurrent transition protection: If two users try to transition the same instance simultaneously, only the first succeeds; second gets a 409 Conflict response
- SLA: Zero tolerance for split-brain state — every transition must be atomic (update instance + write audit in one transaction)

#### 2. High Availability

- Target SLA: 99.95% uptime (~4.4 hours downtime/year)
- Strategy:
  - Stateless NestJS services (no local state) → can restart/replace without data loss
  - PostgreSQL Multi-AZ deployment (primary + standby in different AZs)
  - Redis Cluster with replication
  - Load Balancer across 2+ service instances
  - Health checks + auto-restart (Kubernetes liveness probes)
- Deploy across: Minimum 2 Availability Zones

#### 3. Scalability

- Horizontal scaling: All NestJS services are stateless → spin up more instances under load
- Database scaling: Read replicas for query load; write scaling via PgBouncer connection pooling
- Tenant-level scaling: Large enterprise tenants can be isolated to dedicated instances (tenant sharding)
- Target: Support 10,000 concurrent users, 1,000 tenants, 10M+ workflow instances

#### 4. Latency

| Operation                                | Target P99 Latency |
| ---------------------------------------- | ------------------ |
| Load instance list                       | < 200ms            |
| Execute transition (including rule eval) | < 500ms            |
| Load audit history                       | < 300ms            |
| Load workflow definition (from cache)    | < 50ms             |
| Load workflow definition (from DB)       | < 200ms            |

#### 5. Durability

- Target: 99.999% durability for all data (especially audit logs)
- Strategy:
  - PostgreSQL WAL (Write-Ahead Logging) — every write is logged before commit
  - S3-compatible backup for daily snapshots
  - Audit logs are written synchronously (no fire-and-forget) — a transition isn't "done" until the audit log is persisted
  - No soft deletes on audit logs — hard immutability

#### 6. Fault Tolerance

- Strategy:
  - Circuit Breaker on all external calls (notification service, webhook delivery)
  - If the notification service is down, the transition still succeeds — notifications are decoupled via message queue
  - Dead Letter Queue (DLQ) for failed event processing
  - Retry with exponential backoff for transient failures

#### 7. Resilience

- Graceful degradation: If Redis cache is unavailable, fall back to DB (slower but functional)
- Bulkhead pattern: Tenant A's heavy load doesn't starve tenant B's requests — rate limiting per tenant at API Gateway
- Chaos engineering readiness: Services should handle partial failures without full system collapse

#### 8. Reliability

- Target MTBF (Mean Time Between Failures): > 720 hours (30 days)
- Target MTTR (Mean Time To Recovery): < 15 minutes
- Approach: Immutable infrastructure (containers), blue-green deployments, automated rollback on error rate spike

#### 9. Disaster Recovery

| Scenario                 | RTO (Recovery Time Obj.)             | RPO (Recovery Point Obj.)          |
| ------------------------ | ------------------------------------ | ---------------------------------- |
| Single service crash     | < 1 minute (Kubernetes auto-restart) | 0 data loss                        |
| Database primary failure | < 5 minutes (Multi-AZ failover)      | < 30 seconds (WAL replication lag) |
| Full AZ outage           | < 15 minutes                         | < 1 minute                         |
| Full region outage       | < 4 hours (cross-region restore)     | < 15 minutes                       |

Backup strategy: Continuous WAL archiving to S3, daily snapshots, point-in-time recovery enabled

#### 10 Read/Write Ratio

- Approximately 80% reads / 20% writes under normal operations
- Peak (business hours) transitions: Up to 40% writes during morning approval rushes
- Implication: Route reads to replicas, protect write primary

#### 11 Deployment

- Containerization: Docker for all services
- Orchestration: Kubernetes (EKS on AWS) or Docker Compose for smaller deployments
- CI/CD: GitHub Actions → build → test → Docker image push → Helm chart deploy to k8s
- Environments: dev → staging → production (with proper tenant data isolation)
- Secrets management: AWS Secrets Manager / HashiCorp Vault (never .env files in production)
- Compliance considerations:
  - GDPR: Tenant data deletion must cascade (right to erasure), data residency controls
  - SOC2: Audit logs must be tamper-proof, access logs retained for 1 year
  - HIPAA (if healthcare tenant): Encryption at rest (AES-256), in-transit (TLS 1.3), BAA required

#### Non-Functional Requirements (Quantitative targets)

Below are sane “enterprise SaaS” starting SLAs (tunable by tier):

|              NFR               |                                 Suggested SLA/SLO                                  |                                 Notes                                 |
| :----------------------------: | :--------------------------------------------------------------------------------: | :-------------------------------------------------------------------: |
|          Consistency           |         Workflow state transitions: strong consistency (no double-approve)         |         Per-instance correctness; prevents double-transition          |
|       High Availability        |                   Core API + execution: 99.95% (≈ 22 min/month)                    |            Baseline availability target for initial tiers             |
| High Availability (Enterprise) |                     Enterprise tier: 99.99% (≈ 4.4 min/month)                      |            Higher tier target with tighter downtime budget            |
|         Latency (p95)          |                            Read instance state: < 150ms                            |       Applies to common read paths (cache/DB depending on hit)        |
|         Latency (p95)          |                        Transition request accepted: < 250ms                        | “Accepted” is API acknowledgement; end-to-end connector work is async |
|           Durability           | Definitions/instances/audit: 11 9s durability target via managed storage + backups |       Managed DB + backup strategy is the durability foundation       |
|        Fault tolerance         |                            At-least-once event delivery                            |            Requires idempotent consumers and dedupe logic             |
|        Fault tolerance         |                  Idempotent transition processing (safe retries)                   |         Prevents duplicate effects on client retries/timeouts         |
|           Resilience           |                        Backpressure + queues for connectors                        |        Protects core execution from slow external dependencies        |
|           Resilience           |                       Circuit breakers around external calls                       |        Prevents cascading failures from outbound integrations         |
|       Disaster Recovery        |                           RPO: 5–15 minutes (tier-based)                           |                Data loss window varies by tier/budget                 |
|       Disaster Recovery        |                          RTO: 30–60 minutes (tier-based)                           |             Restore time objective varies by tier/budget              |
|        Deployment model        |                            Start single-region multi-AZ                            |     Standard SaaS baseline for HA without multi-region complexity     |
|        Deployment model        |              Move to multi-region active-active for enterprise later               |                Future evolution path for stricter SLAs                |
|         Observability          |                 100% transitions produce structured logs + traces                  |         Required for debugging, auditing, and SLO enforcement         |

## Appendix A. Embedded Reference Sections (verbatim)

### Section 1: Microservice-Extractable Contract-First Modular Monolith

<!-- SECTION 1 BEGIN HERE -->

Cross-Module Data Access — The Right Patterns

First, Define the Problem Precisely

You have three distinct scenarios disguised as one question. Each needs a different solution.

| Scenario                                               | Example                                                                        | Wrong Solution                 | Right Solution                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------- |
| Current request user context                           | TenantService needs to know WHO is making this API call                        | Query users table              | Read from JWT claims                        |
| Synchronous lookup of another entity                   | TenantService needs details of a specific user by ID to process business logic | Import UserRepository directly | Export a contract interface from AuthModule |
| Data needed for complex queries / joins across modules | WorkflowExecution needs tenant plan limits + user roles together               | Cross-module SQL join          | Event-driven shadow/read mode               |

#### Pattern 1 — JWT Claims (Zero DB Calls)

When to use it

When the data you need is about the currently authenticated user making the request. This covers 80% of apparent cross-module data needs.

How it works

The JWT token is issued by AuthModule at login time. It contains a payload. That payload travels with every request. Every module can read it without touching the database.

```ts
//JWT Payload (set at login, read everywhere):
{
  sub: "user-uuid",
  email: "john@acme.com",
  tenantId: "tenant-uuid",
  roles: ["Admin"],
  firstName: "John",
  plan: "pro"         ← tenant plan embedded too
}
```

The @CurrentUser() decorator in libs/shared extracts this from request.user (populated by the JWT strategy). No DB call. No module import. No coupling.

```ts
// TenantController:
  createSomething(@CurrentUser() user: JwtPayload) {
    // user.tenantId, user.roles, user.email — all available
    // No AuthModule import needed
  }
```

What lives in the JWT

Populate the JWT intelligently at login time. Include fields that are frequently needed across modules.

```ts
// libs/shared/src/interfaces/jwt-payload.interface.ts
IJwtPayload {
  sub: string           // userId
  email: string
  tenantId: string
  tenantSlug: string
  roles: string[]       // ['Admin', 'Approver']
  plan: string          // 'free' | 'pro' | 'enterprise'
  firstName: string
  iat: number
  exp: number
}
```

Rule of thumb: If it's about who is asking, use JWT. If it's about someone or something else, read on.

#### Pattern 2 — Exported Contract Interface (Synchronous Cross-Module Query)

When to use it

When Module B needs to look up a specific entity owned by Module A by ID, and it needs the result before it can continue processing. This is a true synchronous dependency.

The Wrong Way (that breaks microservice extraction)

```ts
typescript; // ❌ WRONG — TenantService directly importing AuthModule's repository
import { UserRepository } from "../auth/repositories/user.repository";

@Injectable()
export class TenantService {
  constructor(private userRepo: UserRepository) {} // ← breaks everything on extraction
}
```

This creates a hard coupling at the repository layer. When you extract AuthModule to its own service, `UserRepository` no longer exists in the same process. Your code breaks.

### The Right Way — Export a Purpose-Built Query Service

AuthModule exposes a **deliberately limited interface** — only the methods other modules are allowed to call. Not the full repository. Not the full UserService. A contract surface.

**Step 1: Create the contract interface in `libs/shared`**

```text
libs/shared/src/interfaces/
  ├── contracts/                       ← NEW folder
  │   ├── user-query.contract.ts       ← what AuthModule promises to expose
  │   ├── tenant-query.contract.ts     ← what TenantModule promises to expose
  │   └── workflow-query.contract.ts   ← what WorkflowDefinitionModule promises to expose
```

```ts
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
  │   ├── auth.service.ts
  │   ├── user.service.ts             ← internal full service
  │   └── user-query.service.ts       ← implements the contract, thin facade
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
      provide: USER_QUERY_CONTRACT,     // ← register against the symbol token
      useClass: UserQueryService,
    },
  ],
  exports: [
    USER_QUERY_CONTRACT,               // ← ONLY this is exported, nothing else
  ],
})
export class AuthModule {}
Step 4: TenantModule consumes it via the contract token
typescript// apps/api/src/modules/tenant/tenant.module.ts

@Module({
  imports: [AuthModule],               // ← imports the whole module
  providers: [TenantService],
})
export class TenantModule {}
typescript// apps/api/src/modules/tenant/services/tenant.service.ts

@Injectable()
export class TenantService {
  constructor(
    @Inject(USER_QUERY_CONTRACT)
    private readonly userQuery: IUserQueryContract,  // ← depends on interface, not class
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

### Why This Is Microservice-Ready

When you extract AuthModule to its own service:

1. Create `AuthGrpcQueryService` that implements the **same `IUserQueryContract` interface**
2. It makes a gRPC call instead of a DB call internally
3. Register it against `USER_QUERY_CONTRACT` token
4. **`TenantService` code does not change at all.** It still calls `this.userQuery.findById()`. It doesn't know or care that it's now a network call.

```
BEFORE EXTRACTION:
TenantService → USER_QUERY_CONTRACT → UserQueryService → UserRepository → DB
                (in-process call)

AFTER EXTRACTION:
TenantService → USER_QUERY_CONTRACT → AuthGrpcQueryService → [network] → Auth Microservice → DB
                (same interface, different implementation)
```

This is the **Dependency Inversion Principle** applied at module boundaries — depend on abstractions, not concretions.

---

## Pattern 3 — Event-Driven Shadow Read Models (Local Denormalization)

### When to use it

When:

- You need data from another module **frequently** (many queries per second)
- You need to **join or filter** across module-owned data for reporting or list views
- The source data **changes infrequently** (users, tenant settings)
- Latency of a synchronous cross-module call would be unacceptable at scale
- You are truly planning to extract to separate microservices (separate DBs, no shared schema)

### The Problem This Solves

Imagine `WorkflowExecution` module needs to show a list of instances with:

- Instance status (owned by WorkflowExecution)
- Creator's full name (owned by Auth)
- Tenant plan (owned by Tenant)

You have two bad options without this pattern:

- Option A: 3 service calls per list item → N+1 query problem → terrible latency
- Option B: Import 2 module services → tight coupling, breaks on extraction

### The Solution — Shadow Table + Event Subscription

Each module maintains a **local denormalized copy** of the foreign data it needs frequently. It keeps this copy fresh by listening to NATS events from the owning module.

**Step 1: WorkflowExecution creates its own shadow table for user data**

```text
apps/api/src/modules/workflow-execution/
  ├── entities/
  │   ├── workflow-instance.entity.ts
  │   └── user-shadow.entity.ts       ← local read model, NOT the source of truth
  ├── repositories/
  │   └── user-shadow.repository.ts
  ├── subscribers/
  │   └── auth-events.subscriber.ts   ← keeps shadow table in sync
```

```typescript
// apps/api/src/modules/workflow-execution/entities/user-shadow.entity.ts

@Entity("we_user_shadows") // ← prefixed 'we_' = workflow-execution module
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

```typescript
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

```typescript
// apps/api/src/modules/workflow-execution/services/workflow-execution.service.ts

async getInstancesForDashboard(tenantId: string): Promise<InstanceDashboardItem[]> {
  // Single SQL query, all within WorkflowExecution module's tables
  return this.instanceRepository.findWithCreatorNames(tenantId);
  // JOIN workflow_instances wi ON we_user_shadows us WHERE us.id = wi.created_by
  // No cross-module call. No N+1. Pure SQL join within this module's data.
}
```

### Why This Is Truly Microservice-Ready

When extracted to separate services with separate databases:

- The shadow table becomes a real standalone table in the WorkflowExecution service's own DB
- The NATS subscription already works across process boundaries — it doesn't care if publisher is in the same process or a different server
- **Zero code changes to the subscriber or the service logic**

---

## Full Decision Tree — Which Pattern When

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

Summary Table — All Three Patterns Side by Side

| Category                  | Pattern 1: JWT Claims                | Pattern 2: Contract Interface               | Pattern 3: Shadow Read Model              |
| ------------------------- | ------------------------------------ | ------------------------------------------- | ----------------------------------------- |
| Use when                  | Data about current request user      | Synchronous lookup of specific entity by ID | High-frequency queries, list views, joins |
| Coupling                  | Zero — no module import              | Loose — depends on interface not class      | Zero — event-driven                       |
| Latency                   | Zero — in-memory                     | Low — in-process service call               | Zero — local DB query                     |
| Consistency               | Strong (from login)                  | Strong (live query)                         | Eventually consistent                     |
| MS extraction cost        | Zero — already works                 | Swap impl to gRPC client                    | Zero — NATS already crosses processes     |
| Code change on extraction | None                                 | One line: swap provider impl                | None                                      |
| Where data lives          | JWT token                            | Owning module's DB                          | Consumer module's own shadow table        |
| Good for                  | userId, tenantId, roles, email, plan | Rare admin lookups, validation              | Dashboards, lists, audit views            |

<!-- SECTION 1 END HERE -->

---

### Section 2: API Architecture Pattern

<!-- SECTION 2 BEGIN HERE -->

API Architecture Pattern
Recommendation: REST for external APIs, Internal Events via NATS

| Pattern                  | Verdict for This System             | Reason                                                                                                                                                              |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REST                     | ✅ Primary API                      | Standard, well-understood, works perfectly for CRUD + resource operations, great tooling (Swagger/OpenAPI), stateless                                               |
| GraphQL                  | ❌ Not recommended as primary       | Overkill for this use case — transitions and workflow execution are action-based, not graph-query-based. Also harder to implement auth middleware cleanly per field |
| gRPC                     | ✅ Internal service-to-service only | If you split into microservices — gRPC for sync calls between services (faster than REST, schema-enforced via Protobuf)                                             |
| SSE (Server-Sent Events) | ✅ For real-time updates            | When an approver is viewing an instance and another user transitions it, SSE pushes the update without polling                                                      |
| WebSockets               | ⚠️ Only if bidirectional needed     | SSE is sufficient for this use case (server pushes to client, not the other way)                                                                                    |

**API Design Principles:**

- OpenAPI 3.0 spec — generated via NestJS @nestjs/swagger decorators
- Versioning: URL-based (/api/v1/) — simplest, most explicit
- Tenant context: tenant_id extracted from JWT, never from the request body (prevents tenant spoofing)
- Idempotency: Transition requests include an idempotency_key header — duplicate requests are safely ignored

<!-- SECTION 2 END HERE -->

---

### Section 3: Microservice Design Patterns Catalogue

<!-- SECTION 3 BEGIN HERE -->

Microservice Design Patterns — Applied or Not
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
| 12  | Service Decomposition | ✅ Yes                      | Decompose by business capability: Auth, Workflow Definition, Workflow Execution, Audit, Notification. Each has a single responsibility and clear bounded context.                                                                                                                                  |
| 13  | Health Monitoring     | ✅ Yes                      | Each service exposes /health (liveness) and /health/ready (readiness) endpoints. Kubernetes probes these. Prometheus scrapes metrics. Grafana dashboards alert on SLA breaches.                                                                                                                    |
| 14  | Bulkhead Pattern      | ✅ Yes                      | Tenant-level rate limiting at the API Gateway — a noisy tenant can't consume all resources. Thread pool isolation for the Rule Engine evaluation (CPU-bound work) — separate from I/O-bound HTTP handlers.                                                                                         |
| 15  | REST Caching          | ✅ Yes                      | Cache GET /workflow-definitions/:id responses in Redis (TTL = 5 minutes, invalidated on publish). Use HTTP ETag + Cache-Control headers on responses.                                                                                                                                              |
| 16  | Polyglot Architecture | ✅ Yes                      | NestJS (TypeScript) for all services; PostgreSQL for relational data; Redis for caching; NATS for messaging. Each tool chosen for what it's best at — not one tech for everything.                                                                                                                 |

<!-- SECTION 3 END HERE -->

---

### Section 4: Database Design

<!-- SECTION 4 BEGIN HERE -->

Is It Read-Heavy or Write-Heavy?
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

#### Strategy:

- Use read replicas in PostgreSQL (AWS RDS with Multi-AZ + Read Replicas)
- Cache workflow definitions aggressively in Redis (they change rarely)
- CQRS — separate read models for dashboards/lists from write models for execution

#### How must the DB be designed (scalability) and why?

- Multi-tenant isolation choice
- From the requirement, you may choose shared DB with tenant_id / schema per tenant / separate DB per tenant.

**Recommended default**: `Shared DB + tenant_id (row-level tenant partitioning)`

**Why:**

- Fast onboarding (no provisioning per tenant)
- Easier operations (one cluster)
- Fits “many tenants” SaaS model
- Can scale with:
  - composite indexes (tenant_id, ...)
  - partitioning by tenant_id or by time for audit tables
  - read replicas

#### When schema-per-tenant or DB-per-tenant is justified:

- “Enterprise” tenants needing hard isolation, custom retention, or regulatory separation.

#### Core design principles

- Every table includes tenant_id
- Workflow definitions are versioned
- Instances reference a specific workflow definition version
- Audit log is append-only (no updates/deletes)
- Enforce concurrency using optimistic locking/version column or transactional row locks for state changes (prevents double approvals).

---

<!-- SECTION 4 END HERE -->

### Section 5: Scalability Considerations

<!-- SECTION 5 BEGIN HERE -->

Scalability Considerations

| Concern                            | Solution                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| High instance volume per tenant    | Partition workflow_instances and audit_logs by tenant_id (PostgreSQL table partitioning)                         |
| Read-heavy audit log queries       | Separate read replica for audit log reads; writes go to primary                                                  |
| Definition caching                 | Cache workflow_definitions + workflow_states + workflow_transitions in Redis (TTL-based invalidation on publish) |
| tenant_id on every query           | Composite indexes on (tenant_id, created_at) on all main tables                                                  |
| Large tenants outgrowing shared DB | Design the schema to support tenant sharding — a routing table maps tenant_id to a database shard                |

<!-- SECTION 5 END HERE -->

---

### Section 6: REFERENCES

<!-- SECTION 6 BEGIN HERE -->

## 12. Microservice or Monolith?

### Recommendation: **Modular Monolith first, architected for microservice extraction**

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

### The Strategy: **Modular Monolith with hard module boundaries**

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

## 13. SQL or NoSQL?

### Recommendation: **PostgreSQL (SQL) as primary, with JSONB for flexible payloads**

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

## 14. Database Design — Schema, Multi-Tenancy, and Scalability

### Multi-Tenancy Strategy: **Shared Database, Shared Schema with `tenant_id`**

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

<!-- SECTION 6 END HERE -->

### Section 7: Rule Engine Mental Picture

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

---

### Section 8: Business Point of View

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

### Section 9: Actors and Personas

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

### Section 10: Foundation

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

---

### Section 11: Tenancy Models Available and Recommendation

> Included this part in FAQ as well

<!-- SECTION 11 BEGIN HERE -->

**Tenancy models available**

1. Shared DB, shared schema (tenant_id column everywhere)
2. Shared DB, schema-per-tenant
3. Separate DB per tenant (Also sometimes: “separate cluster per tenant” for ultra-enterprise.)

| Model                         |        Isolation |    Cost | Operational Complexity |              Scalability | Best For                                     |
| ----------------------------- | ---------------: | ------: | ---------------------: | -----------------------: | -------------------------------------------- |
| Shared DB + shared schema     | Medium (logical) |  Lowest |                 Lowest | High (with partitioning) | 10k+ tenants, SaaS scale                     |
| Shared DB + schema-per-tenant |           Higher |  Medium |            Medium/High |                   Medium | Mid-size tenants needing stronger separation |
| Separate DB per tenant        |          Highest | Highest |                   High |              Medium/High | Regulated or large enterprise tenants        |

#### Which model is best here and why?

- **Default recommendation for your target (10k+ tenants, millions/day)**
- **Shared DB + shared schema (tenant_id) + strong partitioning + encryption controls.**

#### Why:

- **Operationally feasible at 10k tenants**
- **Easier to scale horizontally (sharding/partitioning)**
- **Faster onboarding (no schema creation per tenant)**
- **Better for multi-tenant analytics and global ops**

#### But:

- **You must design isolation seriously:**
- **Row-level isolation (tenant_id enforced)**
- **Partitioning by tenant / time**
- **Per-tenant encryption context**
- **Strict authZ checks**
- **Audit immutability**

#### Enterprise add-on:

- **Offer DB-per-tenant as a premium tier for HIPAA/financial customers when required.**

#### How do we isolate data securely?

**Use defense-in-depth:**

- **AuthN**: tenant-aware identity (JWT contains tenant_id)
- **AuthZ**: RBAC + per-workflow permissions
- **Mandatory tenant filter**: every query scoped by tenant_id (enforced centrally)
- **RLS**: Row-level security (optional) at DB for extra safety
- **Encryption**:
  - at rest (KMS-managed)
  - in transit (TLS)
  - optional per-tenant keys / encryption context
- **No cross-tenant logging**: logs and traces must carry tenant_id and be access-controlled
- **Rate limits** per tenant to prevent noisy neighbor

<!-- SECTION 11 END HERE -->

### Section 12: Workflow Execution Model

#### 12.1 Where are workflows stored?

In your platform persistence:

- **Workflow Definition (versioned)**: states, transitions, rules, role permissions
- **Definition metadata**: published/draft, version graph, validation status

#### 12.2 Where are workflows executed?

In the workflow runtime/execution service:

- It loads the definition (by version)
- Applies transitions on instances
- Writes state updates + audit entries
- Emits events to messaging

**Execution is stateless compute + durable persistence.**

#### 12.3 Execution lifecycle (core)

1. **Definition created** → validated → published (version locked)
2. Instance created from a definition version
3. Instance waits in a state
4. A transition request arrives (user action or system event)
5. Engine checks:
   - allowed role?
   - condition true?
   - concurrency safe?
6. Engine persists:
   - new state
   - task updates
   - immutable audit record
7. Engine emits events/webhooks

#### 12.4 Where does business logic live?

Three tiers (important mental model):

1.  **Engine invariants (platform-owned):**
    - state machine rules, idempotency, concurrency, audit immutability
2.  **Tenant configuration (data, not code):**
    - states/transitions/conditions/roles
3.  **Tenant domain logic (outside engine):**
    - “reserve inventory”, “create invoice”, “update student attendance”
    - done via connectors (HTTP, queues, workers, webhooks)

This is how “school vs e-commerce” both work: the engine orchestrates; domain logic runs in tenant systems or tenant-specific workers.

#### 12.5 How are conditions evaluated?

A **rule evaluator** that takes:

- transition request
- instance data (custom fields)
- user context (roles)
- possibly external facts (fetched via connector)

**Common approach:**

- expression-based rules (safe DSL)
- plus “pluggable predicates” for advanced enterprise needs

#### 10. Interpreted or compiled?

- For a SaaS workflow designer: - Interpreted is the standard: flexible, safe, easy to version and audit.
- “Compiled” only makes sense if you generate code or bytecode—adds risk and complexity.

**Recommendation: interpreted rules + strict sandboxing.**

#### 11. Mental execution flow (trigger → orchestration → task → completion)

1. **Trigger**
   - User clicks “Submit”
   - Or external event arrives (“payment_succeeded”)
2. **Orchestration**
   - Engine loads definition vN
   - Finds valid next transitions
3. **Task execution**
   - If transition includes “call external system”, it enqueues a task/event
   - Worker executes and reports back
4. **Completion**
   - Engine applies resulting transition
   - Writes audit
   - Emits notifications/events

<!-- SECTION 12 END HERE -->
