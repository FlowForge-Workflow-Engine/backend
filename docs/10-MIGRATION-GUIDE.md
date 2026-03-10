---
title: Migration Guide — Modular Monolith to Microservices
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# Migration Guide: Modular Monolith → Microservices

This document is the complete playbook for evolving the platform from its current Modular Monolith deployment into a distributed microservices architecture. It covers the triggers that justify extraction, the phased Strangler Fig migration strategy, the concrete extraction procedure for each bounded context, infrastructure decisions for the distributed system (API gateway, load balancer, observability, deployment), and the operational concerns that must be solved before, during, and after extraction.

Every phase and decision in this guide is grounded in the current codebase's module boundaries, contract interfaces, and NATS event topology. No module needs to be rewritten — the architecture was built from day one to make this transition low-risk and incremental.

---

## Table of Contents

- [1. Overview](#1-overview)
  - [1.1 Why Migrate? — Triggers and Signals](#11-why-migrate--triggers-and-signals)
  - [1.2 Migration Strategy: Strangler Fig Pattern](#12-migration-strategy-strangler-fig-pattern)
  - [1.3 Migration Principles](#13-migration-principles)
- [2. Prerequisites](#2-prerequisites)
  - [2.1 Team & Skills Required](#21-team--skills-required)
  - [2.2 Infrastructure Prerequisites](#22-infrastructure-prerequisites)
  - [2.3 Observability Prerequisites](#23-observability-prerequisites)
  - [2.4 Contract Stability Check](#24-contract-stability-check)
- [3. Migration Phases](#3-migration-phases)
  - [Phase 1: Preparation (In-Monolith)](#phase-1-preparation-in-monolith)
    - [3.1.1 Audit Module Boundaries — Contract Checklist](#311-audit-module-boundaries--contract-checklist)
    - [3.1.2 Identify Data Ownership Per Module](#312-identify-data-ownership-per-module)
    - [3.1.3 Replace Direct DB Joins Across Modules with API Calls](#313-replace-direct-db-joins-across-modules-with-api-calls)
    - [3.1.4 Instrument with Distributed Tracing (OpenTelemetry)](#314-instrument-with-distributed-tracing-opentelemetry)
    - [✦ Example: Auditing the `AuditModule` Boundary](#-example-auditing-the-auditmodule-boundary)
  - [Phase 2: Extract First Microservice](#phase-2-extract-first-microservice)
    - [3.2.1 Choose Extraction Candidate](#321-choose-extraction-candidate)
    - [3.2.2 Create Independent Service](#322-create-independent-service)
    - [3.2.3 Database Extraction — Schema Separation](#323-database-extraction--schema-separation)
    - [3.2.4 Dual-Write Period](#324-dual-write-period)
    - [3.2.5 Traffic Cut-Over](#325-traffic-cut-over)
    - [✦ Example: Extracting `NotificationModule`](#-example-extracting-notificationmodule)
  - [Phase 3: NATS-Based Event Migration](#phase-3-nats-based-event-migration)
    - [3.3.1 Replacing In-Process Events with NATS JetStream](#331-replacing-in-process-events-with-nats-jetstream)
    - [3.3.2 Event Schema Contracts](#332-event-schema-contracts)
    - [✦ Example: Migrating the `workflow-execution.instance.completed` Event](#-example-migrating-the-workflow-executioninstancecompleted-event)
  - [Phase 4: API Gateway Introduction](#phase-4-api-gateway-introduction)
    - [3.4.1 Gateway Selection and Setup](#341-gateway-selection-and-setup)
    - [3.4.2 Routing Rules](#342-routing-rules)
    - [3.4.3 Auth Delegation](#343-auth-delegation)
  - [Phase 5: Full Service Mesh](#phase-5-full-service-mesh)
    - [3.5.1 Service Discovery](#351-service-discovery)
    - [3.5.2 mTLS Between Services](#352-mtls-between-services)
- [4. Module Extraction Priority Order](#4-module-extraction-priority-order)
- [5. Data Migration Considerations](#5-data-migration-considerations)
  - [5.1 Schema Per Service vs Shared Database (Transition Period)](#51-schema-per-service-vs-shared-database-transition-period)
  - [5.2 Data Consistency During Cut-Over](#52-data-consistency-during-cut-over)
  - [5.3 Rollback Strategy](#53-rollback-strategy)
- [6. Infrastructure Decisions for the Distributed System](#6-infrastructure-decisions-for-the-distributed-system)
  - [6.1 Internal Communication Protocol — NATS JetStream + gRPC](#61-internal-communication-protocol--nats-jetstream--grpc)
  - [6.2 API Gateway — Kong vs Apigee vs Amazon API Gateway vs Custom Fastify](#62-api-gateway--kong-vs-apigee-vs-amazon-api-gateway-vs-custom-fastify)
  - [6.3 Load Balancer — NGINX vs HAProxy vs AWS ALB](#63-load-balancer--nginx-vs-haproxy-vs-aws-alb)
  - [6.4 Observability Stack](#64-observability-stack)
  - [6.5 Deployment Strategy — CI/CD, Blue-Green, Canary](#65-deployment-strategy--cicd-blue-green-canary)
- [7. Operating the Distributed System](#7-operating-the-distributed-system)
  - [7.1 Managing Complexity](#71-managing-complexity)
  - [7.2 Ensuring Performance](#72-ensuring-performance)
  - [7.3 Ensuring Resilience and High Availability](#73-ensuring-resilience-and-high-availability)
  - [7.4 Ensuring Security](#74-ensuring-security)
  - [7.5 Ensuring Scalability](#75-ensuring-scalability)
  - [7.6 Ensuring Maintainability](#76-ensuring-maintainability)
  - [7.7 Ensuring Observability](#77-ensuring-observability)
  - [7.8 Ensuring Testability](#78-ensuring-testability)
  - [7.9 Ensuring Governance and Compliance](#79-ensuring-governance-and-compliance)
  - [7.10 Ensuring Extensibility](#710-ensuring-extensibility)
- [8. Troubleshooting](#8-troubleshooting)
- [9. Post-Migration Checklist](#9-post-migration-checklist)

---

## 1. Overview

### 1.1 Why Migrate? — Triggers and Signals

The Modular Monolith is the correct architecture for the current stage of the product. It eliminates the operational overhead of microservices while preserving every boundary decision that makes extraction safe and incremental. Migration to microservices is justified only when specific, measurable pain points appear. Do not migrate speculatively.

The following signals each constitute a legitimate trigger for extraction of the affected module:

| Signal                                                                                                  | Affected Module(s)                       | Why It Justifies Extraction                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transition execution P99 latency exceeds 1 second under load**                                        | `WorkflowExecutionModule`                | The execution module needs more pods than the rest of the application — it handles the highest write throughput. Decoupled scaling requires independent deployment.                                 |
| **Notification delivery failures block a deployment**                                                   | `NotificationModule`                     | If a broken email template or webhook endpoint causes the monolith to fail health checks, it takes down auth, workflow design, and execution. Isolation prevents this blast radius.                 |
| **A schema migration on `audit_logs` requires a full monolith downtime window**                         | `AuditModule`                            | Once `audit_logs` grows to hundreds of millions of rows, `VACUUM`, partition attachment, and index maintenance require maintenance windows. An isolated `AuditService` can be paused independently. |
| **Rule engine CPU spikes during complex custom strategy evaluation affect API latency**                 | `RuleEngineModule`                       | CPU-bound work on a shared pod degrades I/O throughput for all other routes. Extraction allows independent CPU scaling.                                                                             |
| **Team size exceeds 8 engineers**                                                                       | All modules                              | Conway's Law: more than 6–8 engineers working in a single repository creates deployment coordination overhead. Team-per-service enables autonomous release cadences.                                |
| **An enterprise customer requires data residency in a specific region**                                 | `WorkflowExecutionModule`, `AuditModule` | Per-region deployment of execution and audit with tenant routing at the gateway level requires independently deployable services.                                                                   |
| **`WorkflowDefinitionModule` needs a breaking API change but `WorkflowExecutionModule` is mid-release** | `WorkflowDefinitionModule`               | Coupled deployments force version lockstep. Independent deployable services each version their own API.                                                                                             |

**Do not migrate because:** a conference talk said microservices are best practice; a new engineer prefers working in a separate repository; or the team wants to learn Kubernetes. These are not architectural signals — they are preferences that incur real distributed-systems cost.

### 1.2 Migration Strategy: Strangler Fig Pattern

The **Strangler Fig** pattern — named after the vine that gradually grows around a host tree, eventually replacing it — is the safest migration strategy for an operational system. Rather than a "big bang" rewrite, new services are extracted incrementally while the monolith continues serving traffic. The monolith shrinks module by module until it is replaced entirely.

```
Stage 0 (Today):
  ┌──────────────────────────────────────────────────────────┐
  │  Monolith: Auth + Tenant + WorkflowDefinition +          │
  │            WorkflowExecution + RuleEngine + Audit +      │
  │            Notification + Dashboard + Health             │
  └──────────────────────────────────────────────────────────┘
         │ one process, one DB, one deploy

Stage 1 (First extraction):
  ┌─────────────────────────────────────┐    ┌─────────────────┐
  │  Monolith (all except Notification) │───▶│ NotificationSvc │
  └─────────────────────────────────────┘    └─────────────────┘
         │ NATS events fan out to new service

Stage 2 (Second extraction):
  ┌──────────────────────────┐  ┌────────────┐  ┌─────────────────┐
  │  Monolith (core modules) │  │ AuditSvc   │  │ NotificationSvc │
  └──────────────────────────┘  └────────────┘  └─────────────────┘

Stage N (Full extraction):
  Auth ─── Tenant ─── WorkflowDefinition ─── WorkflowExecution ─── RuleEngine
                             │                        │
                          AuditSvc            NotificationSvc
```

At every stage, the system is fully operational. There is no "migration in progress" downtime. Each extraction is independently reversible — if a newly extracted service has issues, the monolith's module is re-enabled and traffic routed back.

### 1.3 Migration Principles

The following principles are non-negotiable. Violating any of them turns a controlled incremental migration into a high-risk distributed rewrite.

| #   | Principle                                                         | Rationale                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **One module extracted at a time**                                | Extracting two modules simultaneously doubles the risk surface and makes root-cause analysis of regressions difficult.                                                                                                |
| 2   | **Never change business logic during extraction**                 | A migration PR that both extracts a module AND changes its behaviour makes it impossible to distinguish migration bugs from logic bugs. Extraction is a structural change only.                                       |
| 3   | **The contract interface is the extraction boundary**             | Only the Symbol-token Contract Interface (`USER_QUERY_CONTRACT`, `WORKFLOW_QUERY_CONTRACT`, etc.) may cross the service boundary. Any code that violates this in the monolith must be fixed before extraction begins. |
| 4   | **Dual-write before cut-over**                                    | During the extraction window, both the monolith module and the new service handle events. This validates the new service is functionally correct before monolith traffic is switched off.                             |
| 5   | **Distributed tracing must be operational before any extraction** | Without a `traceId` linking an HTTP request to NATS events to DB writes across services, debugging a regression becomes guesswork.                                                                                    |
| 6   | **Rollback must be a single environment variable change**         | The traffic routing decision (monolith module vs. new service) must be controllable by a feature flag or a Kong routing rule — not a code deployment.                                                                 |
| 7   | **Contract tests must be green before each cut-over**             | Pact consumer-driven contract tests must pass in CI before any service is promoted to handle production traffic.                                                                                                      |

---

## 2. Prerequisites

### 2.1 Team & Skills Required

Before beginning Phase 1, the team must have sufficient capability across these disciplines:

| Skill                             | Required For                                                              | Minimum Proficiency                                                                               |
| --------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **NestJS — modular applications** | Creating a standalone NestJS app per service                              | Can scaffold a new app with DI, guards, and NATS transport                                        |
| **TypeORM migrations**            | Schema separation — running migrations against a new DB                   | Can write and run migration files; understands `synchronize: false`                               |
| **NATS / NATS JetStream**         | Event durability upgrade from core NATS                                   | Understands consumers, streams, acknowledgement, and push/pull delivery                           |
| **gRPC + Protobuf**               | Replacing contract interface in-process calls with remote procedure calls | Can write `.proto` files, generate TypeScript stubs, register a gRPC server in NestJS             |
| **Docker + docker compose**       | Running multi-service local development                                   | Comfortable editing `docker-compose.yml`, networking services, mapping ports                      |
| **Kubernetes fundamentals**       | Deploying extracted services                                              | Can write `Deployment`, `Service`, `HorizontalPodAutoscaler`, and `PodDisruptionBudget` manifests |
| **Kong Gateway configuration**    | Routing rules, auth plugin, rate limiting                                 | Can write `deck` declarative configuration for services, routes, and plugins                      |
| **OpenTelemetry**                 | End-to-end trace correlation                                              | Can instrument a NestJS app with the OTEL SDK and verify traces in Jaeger                         |
| **Pact contract testing**         | Consumer-driven contract tests before cut-over                            | Can write provider and consumer tests; understands the Pact broker workflow                       |

### 2.2 Infrastructure Prerequisites

The following infrastructure must be provisioned and verified before Phase 2 begins:

| Component              | Current State                               | Required State                                                                                                                      |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **NATS**               | Embedded binary inside the Docker container | External NATS JetStream cluster (minimum 3 nodes with Raft consensus). Set `NATS_URL` env var to cluster URL.                       |
| **PostgreSQL**         | Single shared instance                      | The existing instance continues as the monolith DB. New services get dedicated schemas (Phase 2) or dedicated instances (Phase 4+). |
| **Redis**              | Single shared instance                      | Remains shared for cache and rate limiting. Per-service Redis namespacing (`wf-auth:`, `wf-exec:`) already isolates keys.           |
| **Container registry** | Docker Hub or Render's registry             | Must support per-service image tags. Each service has its own repository: `workflow-engine/auth-service:sha-abc123`.                |
| **Kubernetes cluster** | Not required (Render PaaS)                  | Required for multi-service pod orchestration. Render Kubernetes or AWS EKS.                                                         |
| **Secrets manager**    | `.env` files per deploy environment         | AWS Secrets Manager, HashiCorp Vault, or Doppler. Each service fetches only its own secrets.                                        |
| **Internal DNS**       | Not required (single process)               | Kubernetes DNS: `auth-service.default.svc.cluster.local` resolves to the `AuthService` pod cluster IP.                              |

### 2.3 Observability Prerequisites

Distributed tracing must be operational before the first module is extracted. A bug that is a 5-minute stack trace investigation in the monolith becomes a multi-hour cross-service correlation exercise without it.

**Minimum observability stack before Phase 2:**

| Layer                          | Tool                                          | What It Provides                                                                                                            |
| ------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Distributed tracing**        | OpenTelemetry SDK + Grafana Tempo (or Jaeger) | `traceId` / `spanId` propagation across HTTP calls, NATS events, and DB queries. End-to-end request visualisation.          |
| **Structured log aggregation** | Grafana Loki + Promtail                       | Collects Winston JSON logs from all pods; queryable by `traceId`, `tenantId`, `userId`, `serviceName`.                      |
| **Metrics**                    | Prometheus + Grafana                          | HTTP request rate, P99 latency, DB pool utilisation, Redis hit rate, NATS message processing lag — per pod and per service. |
| **Error tracking**             | Sentry                                        | Unhandled exception aggregation with stack traces, user context, and release tagging. `@sentry/nestjs` integration.         |
| **Alerting**                   | Grafana Alerting or PagerDuty                 | Alerts on: error rate > 1%, P99 > 1s for 5 minutes, pod crash loop, DB pool > 80% utilised, NATS consumer lag growing.      |

**Instrumenting the existing monolith (before extraction):**

```typescript
// main.ts — add before app.listen()
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

Auto-instrumentation covers NestJS HTTP, TypeORM queries, ioredis calls, and HTTP outbound calls — all the I/O that matters for cross-service latency analysis.

### 2.4 Contract Stability Check

Before any extraction, run this checklist against every cross-module interface in the codebase. Any violation must be fixed before extraction proceeds — it represents hidden coupling that will break when the module moves to a separate process.

**Contract checklist for each module:**

```
For each module in src/modules/:

  □ No entity from this module is imported by another module's service or repository
  □ No repository from this module is injected into another module's provider
  □ All cross-module reads use a Symbol-token Contract Interface from libs/shared/src/interfaces/contracts/
  □ All cross-module side effects use NATS events via libs/shared/src/constants/nats-events.enum.ts
  □ No TypeORM @ManyToOne / @OneToMany relation references an entity from another module
  □ All event payload interfaces are in libs/shared/src/interfaces/events/ (not in the module)
  □ The module's public API (controllers) accepts only DTOs from its own dto/ directory
```

**Current contract interfaces and their stability:**

| Contract Symbol                            | Defined In                                                    | Implemented By                                    | Consumed By                                                            | Extraction-Safe? |
| ------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- | ---------------- |
| `USER_QUERY_CONTRACT`                      | `libs/shared/.../user-query.contract.ts`                      | `AuthModule → UserQueryService`                   | `WorkflowExecutionModule` (shadow sync), `TenantModule` (provisioning) | ✅ Yes           |
| `TENANT_QUERY_CONTRACT`                    | `libs/shared/.../tenant-query.contract.ts`                    | `TenantModule → TenantQueryService`               | `AuthModule` (JWT payload), `WorkflowExecutionModule`                  | ✅ Yes           |
| `TENANT_PROVISIONING_CONTRACT`             | `libs/shared/.../tenant-provisioning.contract.ts`             | `TenantModule → TenantProvisioningService`        | `AuthModule` (onboarding)                                              | ✅ Yes           |
| `WORKFLOW_QUERY_CONTRACT`                  | `libs/shared/.../workflow-query.contract.ts`                  | `WorkflowDefinitionModule → WorkflowQueryService` | `WorkflowExecutionModule`                                              | ✅ Yes           |
| `WORKFLOW_EXECUTION_QUERY_CONTRACT`        | `libs/shared/.../workflow-execution-query.contract.ts`        | `WorkflowExecutionModule`                         | `DashboardModule`                                                      | ✅ Yes           |
| `RULE_ENGINE_CONTRACT`                     | `libs/shared/.../rule-engine.contract.ts`                     | `RuleEngineModule → RuleEngineService`            | `WorkflowExecutionModule`                                              | ✅ Yes           |
| `NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT` | `libs/shared/.../notification-template-bootstrap.contract.ts` | `NotificationModule`                              | `AuthModule` (onboarding)                                              | ✅ Yes           |

All seven cross-module contracts are currently extraction-safe. No violations of Constraint 1 (Module Boundary Rules) have been identified.

---

## 3. Migration Phases

### Phase 1: Preparation (In-Monolith)

Phase 1 makes zero functional changes to the running system. It is entirely preparatory — closing any hidden coupling that escaped the contract checklist, establishing data ownership documentation, and instrumenting the monolith for distributed tracing before the first service is extracted.

**Phase 1 completion criteria:** All contract checklist items green; observability stack live; `traceId` visible in logs for at least one production request; data ownership table complete and agreed upon by the team.

#### 3.1.1 Audit Module Boundaries — Contract Checklist

Run the contract checklist from §2.4 against every module. For each violation found, create a dedicated fix PR — do not bundle violation fixes with feature work.

**Common violation patterns to watch for:**

| Violation                                                | How to Detect                                                                   | How to Fix                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `UserRepository` injected outside `AuthModule`           | `grep -r "UserRepository" src/modules --include="*.ts" \| grep -v "auth/"`      | Replace with `@Inject(USER_QUERY_CONTRACT) private readonly userQuery: IUserQueryContract` |
| TypeORM entity imported from another module              | `grep -r "from.*auth/entities" src/modules --include="*.ts" \| grep -v "auth/"` | Return a DTO/summary interface instead; use the contract interface return type             |
| Raw `DataSource.query()` that joins across module tables | Review all `DataSource.query()` calls for table names from multiple modules     | Rewrite as a shadow read model query (Pattern 3) or a contract interface call (Pattern 2)  |
| Event payload interface defined inside a module's folder | `find src/modules -name "*events.interface.ts"`                                 | Move to `libs/shared/src/interfaces/events/`                                               |

#### 3.1.2 Identify Data Ownership Per Module

Each table in the PostgreSQL database has exactly one owning module. This table is the authoritative reference during schema extraction in Phase 2:

| Table                    | Owner Module               | Tables in Same Schema Group                                                                                            | Notes                                                 |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `users`                  | `AuthModule`               | `roles`, `permissions`, `user_roles`, `refresh_tokens`                                                                 | JWT source of truth                                   |
| `tenants`                | `TenantModule`             | `tenant_settings`, `tenant_feature_flags`                                                                              | The only tables without `tenant_id`                   |
| `workflow_definitions`   | `WorkflowDefinitionModule` | `workflow_definition_versions`, `workflow_states`, `workflow_transitions`, `transition_rules`, `instance_form_schemas` | Immutable snapshots live here                         |
| `workflow_instances`     | `WorkflowExecutionModule`  | `we_user_shadows`                                                                                                      | Core runtime table; highest write volume              |
| `audit_logs`             | `AuditModule`              | —                                                                                                                      | Append-only; no `updated_at`; protected by DB trigger |
| `notification_templates` | `NotificationModule`       | `notification_logs`, `webhook_configs`, `webhook_delivery_logs`                                                        | All notification config and delivery state            |

**Rule:** When a module is extracted as a service, only the tables in its "Tables in Same Schema Group" column move with it. No other tables move. If an extracted service ever needs data from another module's tables, it must go through that module's contract interface — never via a direct DB connection to another service's schema.

#### 3.1.3 Replace Direct DB Joins Across Modules with API Calls

The codebase currently has no direct cross-module DB joins — this was enforced from day one by Constraint 1. However, verify this holds by checking for TypeORM `leftJoinAndSelect` or `createQueryBuilder()` calls that reference entities from more than one module's entity directory.

```bash
# Scan for cross-module joins — should return no results
grep -r "leftJoinAndSelect\|createQueryBuilder" src/modules --include="*.ts" \
  | grep -v "// internal"
```

The `we_user_shadows` table in `WorkflowExecutionModule` is the Pattern 3 shadow read model — it is intentionally a copy of user data, maintained by `AuthEventsSubscriber` (`src/modules/workflow-execution/subscribers/auth-events.subscriber.ts`) which listens to `auth.user.created`, `auth.user.deactivated`, and `auth.user.roles-updated` NATS events. This is correct and requires no modification. When `AuthModule` is extracted, the NATS events continue to flow — the shadow sync is already cross-process compatible.

#### 3.1.4 Instrument with Distributed Tracing (OpenTelemetry)

Inject the OpenTelemetry SDK in `main.ts` (see §2.3). Verify that:

1. Each incoming HTTP request has a `traceId` in the Winston log output.
2. The `traceId` is propagated as a `traceparent` header on any outbound HTTP calls made during the request.
3. NATS event payloads include the `traceId` as a metadata field (add to the `eventId`-containing interfaces in `libs/shared/src/interfaces/events/`):

```typescript
// Add to all event payload interfaces
export interface IBaseEvent {
  readonly eventId: string; // existing — idempotency
  readonly traceId?: string; // NEW — distributed trace correlation
  readonly occurredAt: string;
}
```

Publishers populate `traceId` from the active OpenTelemetry span context. Subscribers extract it and activate a child span — creating a traceable chain from the HTTP request through the NATS event to the audit log write.

#### ✦ Example: Auditing the `AuditModule` Boundary

`AuditModule` (`src/modules/audit/`) is the simplest bounded context to audit because it has no synchronous dependencies on other modules — it is a pure NATS event consumer:

```
AuditModule boundary audit:

  ✅ AuditLogRepository is never imported outside AuditModule
     grep -r "AuditLogRepository" src/modules --include="*.ts" | grep -v "audit/"
     → 0 results

  ✅ AuditLog entity is never imported outside AuditModule
     grep -r "from.*audit/entities" src/modules --include="*.ts" | grep -v "audit/"
     → 0 results

  ✅ AuditSubscriber only uses @EventPattern — no outbound NATS publishes
     grep -r "natsClient.publish" src/modules/audit --include="*.ts"
     → 0 results

  ✅ AuditModule exports no providers (nothing to be accidentally injected elsewhere)
     cat src/modules/audit/audit.module.ts | grep "exports:"
     → exports: []

  ✅ All 12 consumed event subjects are from NatsEvents enum
     grep "NatsEvents\." src/modules/audit/subscribers/audit.subscriber.ts
     → 12 references, all valid enum values

  ✅ Event payload interfaces are from libs/shared
     grep "from.*interfaces/events" src/modules/audit/subscribers/audit.subscriber.ts
     → All from @app/shared/interfaces/events/

  → AuditModule is 100% extraction-ready. Zero boundary violations.
```

---

### Phase 2: Extract First Microservice

#### 3.2.1 Choose Extraction Candidate

Select the module with the **lowest coupling to other modules** and the **clearest NATS-only integration boundary**. This minimises risk on the first extraction and builds team confidence with the process.

**Extraction candidate ranking:**

| Rank | Module                     | Incoming Sync Deps                                              | Outgoing Sync Deps                                 | Integration                  | Rationale                                                                                                    |
| ---- | -------------------------- | --------------------------------------------------------------- | -------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1st  | `NotificationModule`       | None                                                            | None (pure NATS consumer + email/webhook delivery) | NATS only                    | Zero synchronous contracts; only subscribes to events and delivers externally. Ideal first extraction.       |
| 2nd  | `AuditModule`              | None                                                            | None (pure NATS consumer + DB write)               | NATS only                    | Same profile as Notification; even simpler (no external HTTP delivery).                                      |
| 3rd  | `RuleEngineModule`         | Used by `WorkflowExecutionModule` via `RULE_ENGINE_CONTRACT`    | None                                               | Sync contract                | Stateless evaluation service; no DB tables. Extraction converts one in-process function call to a gRPC call. |
| 4th  | `WorkflowDefinitionModule` | Used by `WorkflowExecutionModule` via `WORKFLOW_QUERY_CONTRACT` | None                                               | Sync contract + NATS publish | More complex — snapshot reads are on the hot execution path; requires gRPC for performance.                  |
| 5th  | `TenantModule`             | Used by `AuthModule` via two contracts                          | Publishes NATS events                              | Sync contracts + NATS        | Two consuming modules must update their gRPC client registrations simultaneously.                            |
| 6th  | `WorkflowExecutionModule`  | Multiple contracts + RuleEngine                                 | NATS publishes                                     | Sync + NATS                  | Most complex; highest value (independent scaling); extract last among core modules.                          |
| 7th  | `AuthModule`               | Used by all modules via `USER_QUERY_CONTRACT`                   | Multiple                                           | Sync contracts + NATS        | Highest blast radius if extraction goes wrong; leave for last.                                               |

#### 3.2.2 Create Independent Service

Create a new NestJS application in the monorepo alongside the existing `src/`:

```
root/
├── apps/
│   ├── api/              ← existing monolith (rename src/ to apps/api/)
│   └── notification/     ← new NotificationService
├── libs/
│   └── shared/           ← unchanged — shared by all apps
├── docker/
└── package.json
```

The new `apps/notification/src/main.ts` is a minimal NestJS bootstrap that:

1. Imports `NotificationModule` — copied verbatim from `src/modules/notification/`.
2. Registers the NATS hybrid transport to subscribe to the same event subjects.
3. Exposes a `/health` endpoint via `HealthModule`.
4. Reads `NOTIFICATION_DB_URL`, `NOTIFICATION_REDIS_URL`, and `NATS_URL` from environment variables.

```typescript
// apps/notification/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.NATS,
    options: createNatsOptions(app.get(ConfigService)),
  });
  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 10001);
}
```

The `NotificationModule` source code is unchanged — it is either symlinked from `src/modules/notification/` or, better, moved to `libs/notification/` so both the monolith and the new service can import it during the dual-write period.

#### 3.2.3 Database Extraction — Schema Separation

For `NotificationModule`, the tables to extract are: `notification_templates`, `notification_logs`, `webhook_configs`, `webhook_delivery_logs`.

**Step 1: Create a dedicated PostgreSQL schema in the existing database (not a new database yet):**

```sql
-- Migration: create notification schema
CREATE SCHEMA IF NOT EXISTS notification;

-- Move tables to the new schema
ALTER TABLE notification_templates SET SCHEMA notification;
ALTER TABLE notification_logs SET SCHEMA notification;
ALTER TABLE webhook_configs SET SCHEMA notification;
ALTER TABLE webhook_delivery_logs SET SCHEMA notification;
```

**Step 2: Update TypeORM entity decorators to specify the schema:**

```typescript
@Entity({ schema: 'notification', name: 'notification_templates' })
export class NotificationTemplate extends BaseEntity { ... }
```

**Step 3: Create a dedicated PostgreSQL role for the notification service:**

```sql
CREATE ROLE notification_svc LOGIN PASSWORD '<generated>';
GRANT CONNECT ON DATABASE workflow_engine TO notification_svc;
GRANT USAGE ON SCHEMA notification TO notification_svc;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA notification TO notification_svc;
```

The new service connects using `notification_svc` credentials. It has no access to `public` schema tables (users, tenants, workflow_instances, audit_logs). Schema-level permissions enforce the data ownership boundary at the database level.

#### 3.2.4 Dual-Write Period

During the dual-write period, both the monolith's `NotificationModule` and the new `NotificationService` subscribe to the same NATS subjects. Both process the same events.

The idempotency pattern already built into all subscribers makes this safe:

```typescript
// NotificationSubscriber.onTransitionCompleted() — already idempotent
// Both the monolith and the new service receive the same event.
// Only one will find an absent notification_logs record and INSERT.
// The other will find the existing record and skip the operation.
const exists = await this.notifLogRepo.existsByEventId(data.eventId);
if (exists) return; // idempotent skip
```

The dual-write period should last **one full production cycle** (at least 24 hours) with both services receiving traffic. Compare `notification_logs` row counts and delivery success rates between the two. When they match, the monolith's subscription can be disabled.

**Dual-write monitoring checklist:**

```
□ Both services are receiving NATS events (check NATS subscriber count via nats-server monitoring)
□ notification_logs row counts match between monolith write and service write (after deduplication)
□ No email or webhook delivery errors in NotificationService that are not also present in monolith
□ NotificationService health check passing for 24+ hours
□ NotificationService pod restarts: 0 in 24 hours
```

#### 3.2.5 Traffic Cut-Over

Cut-over is a two-step operation:

**Step 1 — Disable monolith's NotificationModule subscriptions:**

```typescript
// apps/api/src/modules/notification/notification.module.ts
// Comment out or feature-flag the subscriber registration:
// controllers: [NotificationSubscriber],   ← disabled
```

Deploy the monolith without the subscriber. The new `NotificationService` now handles all events exclusively.

**Step 2 — Monitor for 48 hours:**

Watch for: missed notification deliveries, duplicated deliveries, errors in `notification_logs`, and `webhook_delivery_logs` failures. If any critical issue appears, re-enable the monolith subscriber (single line uncomment + redeploy).

**Step 3 — Remove NotificationModule from the monolith:**

After the 48-hour watch period, delete `src/modules/notification/` from the monolith source. The extraction is complete.

#### ✦ Example: Extracting `NotificationModule`

Concrete task breakdown for the first extraction sprint:

```
Sprint: NotificationModule Extraction

Week 1:
  □ Move notification/ to libs/notification/ (shared between monolith and new service)
  □ Create apps/notification/ with minimal NestJS bootstrap
  □ Write apps/notification/Dockerfile
  □ Add apps/notification CI/CD pipeline to GitHub Actions
  □ Run notification schema migration (schema separation, dedicated role)
  □ Verify new service connects to notification schema and subscribes to NATS

Week 2:
  □ Deploy NotificationService to staging
  □ Enable dual-write (both monolith + new service subscribed)
  □ Run 24-hour comparison: notification_logs counts, delivery success rates
  □ Deploy to production with dual-write enabled
  □ Monitor for 24 hours

Week 3:
  □ Disable monolith NotificationModule subscriptions (deploy)
  □ Monitor for 48 hours (no monolith fallback active)
  □ Remove src/modules/notification/ from monolith
  □ Merge cleanup PR
  □ Write runbook for NotificationService

Done: NotificationService is a standalone service.
      Monolith is one module smaller.
```

---

### Phase 3: NATS-Based Event Migration

#### 3.3.1 Replacing In-Process Events with NATS JetStream

Core NATS (used today) provides at-most-once delivery. When services are physically separated, this is insufficient — a service restart between publish and delivery silently loses the event. The upgrade to **NATS JetStream** provides durable streams with at-least-once delivery and acknowledgement-based consumption.

**What changes:**

| Component               | Core NATS (today)                                         | JetStream (after migration)                                                         |
| ----------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Publisher               | `natsClient.publish(subject, payload)` — fire-and-forget  | `js.publish(subject, payload)` — buffered to durable stream                         |
| Subscriber              | `@EventPattern(NatsEvents.X)` — transient, no persistence | Durable consumer with `ack()` — broker retains until acknowledged                   |
| Message loss on restart | Yes — undelivered messages are lost                       | No — broker re-delivers until `ack()` is called                                     |
| Duplicate handling      | Already implemented via `eventId` idempotency check       | Same `eventId` check still required (at-least-once = potential duplicates on retry) |
| Broker setup            | Single embedded binary                                    | NATS JetStream cluster (3 nodes); streams configured per subject prefix             |

**Stream configuration per domain:**

```
Stream: AUTH_EVENTS
  Subjects: auth.user.created, auth.user.deactivated, auth.user.roles-updated
  Retention: WorkQueuePolicy (delete on ack)
  Replicas: 3
  MaxAge: 7 days (replay window for recovery)

Stream: TENANT_EVENTS
  Subjects: tenant.created, tenant.deactivated, tenant.plan-updated

Stream: WORKFLOW_DEFINITION_EVENTS
  Subjects: workflow-definition.published, workflow-definition.deprecated

Stream: WORKFLOW_EXECUTION_EVENTS
  Subjects: workflow-execution.instance.created, workflow-execution.transition.completed,
            workflow-execution.instance.completed, workflow-execution.instance.cancelled
```

**The application code change is minimal.** NestJS's NATS transport abstraction handles the underlying JetStream client configuration — only the `createNatsOptions()` factory in `src/infra/nats.config.ts` changes:

```typescript
// Before (core NATS):
return { servers: [natsUrl], maxReconnectAttempts: -1 };

// After (JetStream-enabled):
return {
  servers: [natsUrl],
  maxReconnectAttempts: -1,
  jetstream: true, // enable JetStream client
  // stream/consumer config via nats.io SDK
};
```

#### 3.3.2 Event Schema Contracts

As services become independent deployable units, event payload interfaces must be treated as versioned public contracts — not internal TypeScript types that can be freely changed.

**Protobuf for event schemas (recommended):**

Replace the TypeScript-only event interfaces in `libs/shared/src/interfaces/events/` with **Protobuf `.proto` definitions**. Protobuf provides:

- Language-agnostic schema — if a future service is written in Go or Python, it can consume the same events.
- Wire compatibility — adding optional fields is backward-compatible; removing fields requires a version bump.
- Schema registry — the `.proto` files in `libs/shared/proto/` are the single source of truth for all event shapes.

```protobuf
// libs/shared/proto/workflow_events.proto
syntax = "proto3";

message WorkflowTransitionCompletedEvent {
  string event_id      = 1;
  string trace_id      = 2;
  string tenant_id     = 3;
  string instance_id   = 4;
  string from_state    = 5;
  string to_state      = 6;
  string transition_id = 7;
  // ...
}
```

**Event versioning policy:**

| Change Type        | Strategy                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Add optional field | Safe — backward compatible. Increment minor version in the stream name comment.                                                     |
| Rename field       | Breaking. Publish to new subject (`workflow-execution.transition.completed.v2`); deprecate old subject after all consumers migrate. |
| Remove field       | Breaking. Same as rename. Never remove a field without a deprecation period.                                                        |
| Change field type  | Always breaking. Treat as a new event type.                                                                                         |

#### ✦ Example: Migrating the `workflow-execution.instance.completed` Event

Today, `ExecutionPublisher.publishInstanceCompleted()` calls `nats.publish(NatsEvents.WORKFLOW_INSTANCE_COMPLETED, jc.encode(payload))`. Two subscribers consume it: `AuditSubscriber` and `NotificationSubscriber`.

After JetStream migration:

```
Producer (WorkflowExecutionService):
  js.publish('workflow-execution.instance.completed', encode(payload))
           │
           ▼
  JetStream Stream: WORKFLOW_EXECUTION_EVENTS
  (durable, replicated, retained 7 days)
           │
    ┌──────┴──────┐
    ▼             ▼
Consumer:       Consumer:
AuditSvc        NotificationSvc
(durable,       (durable,
ack on insert)  ack on delivery)
```

If `AuditService` restarts mid-delivery, the message is re-delivered after the `ack_wait` timeout (default 30s). `insertIfAbsent(eventId)` in `AuditLogRepository` ensures the re-delivered message produces no duplicate row.

---

### Phase 4: API Gateway Introduction

#### 3.4.1 Gateway Selection and Setup

**Decision: Kong Gateway (open-source)**

An API gateway becomes necessary once multiple services need to be exposed to external clients (browser, mobile, third-party integrations) through a single ingress point. Without a gateway, each service would need its own public URL, its own TLS certificate, its own CORS configuration, and its own auth validation logic.

**Evaluation:**

| Gateway                    | Deployment                                  | Auth Plugin                                                                           | Rate Limiting                                              | Rationale                                                                                                  |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Kong (recommended)**     | Kubernetes Ingress Controller or standalone | JWT validation plugin (validates RS256 tokens at gateway, before hitting any service) | Rate Limiting Advanced plugin (tenant-aware, Redis-backed) | Open-source, self-hostable, no per-request cost, 100+ plugins, declarative `deck` config, active community |
| **AWS API Gateway**        | Managed (zero ops)                          | Lambda authoriser or Cognito                                                          | Usage Plans                                                | Best if fully AWS-native; per-request pricing becomes expensive at volume; tighter AWS lock-in             |
| **Apigee (Google)**        | Managed enterprise                          | OAuth/OIDC                                                                            | Quota policies                                             | Enterprise-grade analytics and developer portal; overkill and expensive for a startup; complex pricing     |
| **Custom Fastify gateway** | Self-hosted                                 | Hand-rolled                                                                           | Hand-rolled                                                | Full control but weeks of engineering work building what Kong provides out of the box; not recommended     |

**Kong setup (declarative configuration via `deck`):**

```yaml
# kong.yaml
services:
  - name: auth-service
    url: http://auth-service.default.svc.cluster.local:10000
    routes:
      - name: auth-routes
        paths: ["/api/auth", "/api/users", "/api/roles"]

  - name: workflow-definition-service
    url: http://workflow-definition-service.default.svc.cluster.local:10000
    routes:
      - name: definition-routes
        paths: ["/api/workflow-definitions"]

  - name: workflow-execution-service
    url: http://workflow-execution-service.default.svc.cluster.local:10000
    routes:
      - name: execution-routes
        paths: ["/api/workflow-instances"]

plugins:
  - name: jwt
    config:
      secret_is_base64: false
      key_claim_name: sub
  - name: rate-limiting-advanced
    config:
      limit: [1000]
      window_size: [60]
      identifier: consumer
      namespace: kong_rl
      strategy: redis
      redis:
        host: redis-service
        port: 6379
```

#### 3.4.2 Routing Rules

| Path Prefix                    | Routes To                                           | Notes                                                |
| ------------------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| `/api/auth/**`                 | `AuthService`                                       | Login, register, refresh, logout                     |
| `/api/users/**`                | `AuthService`                                       | User CRUD, role assignment                           |
| `/api/roles/**`                | `AuthService`                                       | Role/permission management                           |
| `/api/tenants/**`              | `TenantService`                                     | Tenant settings, feature flags                       |
| `/api/workflow-definitions/**` | `WorkflowDefinitionService`                         | Definition CRUD, states, transitions, rules, publish |
| `/api/workflow-instances/**`   | `WorkflowExecutionService`                          | Instance lifecycle, transitions, audit logs          |
| `/api/notifications/**`        | `NotificationService`                               | Template management                                  |
| `/api/webhooks/**`             | `NotificationService`                               | Webhook config management                            |
| `/api/dashboard/**`            | `DashboardService` (or `WorkflowDefinitionService`) | Aggregated stats                                     |
| `/health`                      | All services (via gateway health check)             | Liveness probes per service                          |

**Path-based routing** is preferred over subdomain-based routing (`auth.api.example.com`) because it requires only one TLS certificate, one CORS configuration, and one ingress rule. All services share the same base domain.

#### 3.4.3 Auth Delegation

Kong's JWT plugin validates the access token **before** the request reaches any service. If validation fails, Kong returns `401` directly — no service pod processes the invalid request.

For services that still need the validated user context:

```
Client → [Authorization: Bearer <jwt>]
        → Kong JWT Plugin validates signature + expiry
        → Kong extracts claims and injects headers:
              X-Consumer-ID: <sub>
              X-Tenant-ID: <tenantId>
              X-User-Roles: ["Admin"]
              X-Tenant-Plan: "pro"
        → Service receives request with trusted headers
        → Service's JwtAuthGuard reads from headers (not re-validates JWT)
```

Services no longer need `JWT_SECRET` — Kong holds it. Services trust the `X-*` headers set by Kong because they are only reachable via the internal cluster network (not publicly routable). The `TenantIsolationGuard` continues to verify `X-Tenant-ID` is present and non-empty.

---

### Phase 5: Full Service Mesh

#### 3.5.1 Service Discovery

Within a Kubernetes cluster, service discovery is native: Kubernetes DNS resolves `auth-service.default.svc.cluster.local` to the cluster IP of the `AuthService` pods. The `gRPC` client for the `USER_QUERY_CONTRACT` implementation uses this DNS name:

```typescript
// In WorkflowExecutionService: implementation of USER_QUERY_CONTRACT
@Injectable()
export class UserQueryGrpcClient implements IUserQueryContract {
  private client: UserQueryServiceClient;

  constructor(private readonly configService: ConfigService) {
    this.client = new UserQueryServiceClient(
      `${configService.get("AUTH_SERVICE_HOST")}:${configService.get("AUTH_SERVICE_GRPC_PORT")}`,
      credentials.createInsecure(), // mTLS handles security at mesh layer
    );
  }

  async findById(userId: string, tenantId: string): Promise<UserSummary | null> {
    return this.client.findById({ userId, tenantId });
  }
}
```

`AUTH_SERVICE_HOST` is set to `auth-service.default.svc.cluster.local` in the Kubernetes `Deployment` manifest — no hard-coded IPs, no service registries, no Consul.

**Kubernetes Service manifest for AuthService:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: auth-service
  namespace: default
spec:
  selector:
    app: auth-service
  ports:
    - name: http
      port: 10000
      targetPort: 10000
    - name: grpc
      port: 50051
      targetPort: 50051
```

#### 3.5.2 mTLS Between Services

All gRPC calls between services must use mutual TLS — each pod presents a certificate; the receiving pod verifies it was issued by the cluster's certificate authority.

**Recommended implementation: Istio service mesh (or Linkerd for simpler setup)**

Istio injects a sidecar proxy (Envoy) into every pod automatically. The sidecar handles mTLS negotiation, certificate rotation, and traffic encryption — application code never handles certificates directly. The `credentials.createInsecure()` in the gRPC client above is correct from the application's perspective because Istio intercepts and upgrades the connection to mTLS before it leaves the pod.

```yaml
# PeerAuthentication — enforce mTLS for all pods in the namespace
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: default
spec:
  mtls:
    mode: STRICT # reject all plaintext connections between pods
```

With `STRICT` mode, a pod cannot communicate with another pod without a valid cluster-issued certificate. Even if an attacker gains access to the cluster network, they cannot impersonate a service pod.

---

## 4. Module Extraction Priority Order

| Priority | Module                     | Service Name                | Reason for This Priority                                                                                                                                                                                                                                                              | Upstream Dependencies                                                                       | Downstream Dependents                                                   |
| -------- | -------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1        | `NotificationModule`       | `NotificationService`       | Zero synchronous contracts; pure NATS consumer + external HTTP delivery. Ideal first extraction to practice the process with lowest risk.                                                                                                                                             | None                                                                                        | None                                                                    |
| 2        | `AuditModule`              | `AuditService`              | Zero synchronous contracts; pure NATS consumer + append-only DB write. Even simpler than Notification — no external delivery. High value: audit table isolation enables independent schema partitioning.                                                                              | None                                                                                        | None                                                                    |
| 3        | `RuleEngineModule`         | `RuleEngineService`         | Stateless — no DB tables, no NATS events. Extraction converts one in-process function call (`RULE_ENGINE_CONTRACT`) to one gRPC call. Isolation allows independent CPU scaling for complex rule evaluation.                                                                           | None                                                                                        | `WorkflowExecutionModule` (via `RULE_ENGINE_CONTRACT`)                  |
| 4        | `WorkflowDefinitionModule` | `WorkflowDefinitionService` | After Phase 3 (JetStream), the `WORKFLOW_QUERY_CONTRACT` becomes a gRPC service. Snapshot reads are on the hot transition path — gRPC over HTTP/2 keeps latency acceptable.                                                                                                           | `AuthModule` (JWT only — no contract call)                                                  | `WorkflowExecutionModule` (via `WORKFLOW_QUERY_CONTRACT`)               |
| 5        | `WorkflowExecutionModule`  | `WorkflowExecutionService`  | The core domain — highest scaling value. Requires `RULE_ENGINE_CONTRACT` and `WORKFLOW_QUERY_CONTRACT` to already be gRPC services (priorities 3 and 4). CQRS separation of commands and queries makes independent read-replica routing straightforward.                              | `WorkflowDefinitionService` (gRPC), `RuleEngineService` (gRPC), `AuthModule` (JWT + shadow) | Dashboard, external API consumers                                       |
| 6        | `TenantModule`             | `TenantService`             | Used by `AuthModule` via two contracts (`TENANT_QUERY_CONTRACT`, `TENANT_PROVISIONING_CONTRACT`). Extracting Tenant before Auth means AuthService must be updated to gRPC-call TenantService for JWT payload population.                                                              | None                                                                                        | `AuthModule` (two contracts)                                            |
| 7        | `AuthModule`               | `AuthService`               | Highest blast radius — every service depends on JWT validation or `USER_QUERY_CONTRACT`. Extract last. After extraction, the gRPC `USER_QUERY_CONTRACT` is consumed by `WorkflowExecutionService` (shadow sync) only; Kong JWT plugin handles auth validation for all other services. | `TenantService` (gRPC)                                                                      | All services (JWT validation), `WorkflowExecutionService` (user shadow) |

---

## 5. Data Migration Considerations

### 5.1 Schema Per Service vs Shared Database (Transition Period)

The migration progresses through three database topology stages:

**Stage A — Single database, single schema (today):**

All 22 tables share the `public` schema in one PostgreSQL instance. All modules connect as the same DB user. This is the starting point.

**Stage B — Single database, separate schemas (during Phases 2–3):**

As each module is extracted, its tables move to a dedicated PostgreSQL schema (`notification`, `audit`, `workflow_execution`, etc.) within the same database instance. Each service connects with a dedicated role scoped to its schema. This provides:

- Logical separation with zero network latency change.
- Schema-level permission enforcement (a `notification_svc` role cannot `SELECT` from `workflow_instances`).
- Easy rollback — schemas are recombined by changing connection credentials.

```sql
-- Schema separation sequence (applied incrementally as each module is extracted)
CREATE SCHEMA notification;    -- Phase 2: NotificationModule extraction
CREATE SCHEMA audit;           -- Phase 2: AuditModule extraction
CREATE SCHEMA rule_engine;     -- Phase 3: RuleEngineModule (no tables, skip)
CREATE SCHEMA workflow_def;    -- Phase 4: WorkflowDefinitionModule extraction
CREATE SCHEMA workflow_exec;   -- Phase 5: WorkflowExecutionModule extraction
CREATE SCHEMA tenant;          -- Phase 6: TenantModule extraction
CREATE SCHEMA auth;            -- Phase 7: AuthModule extraction
```

**Stage C — Separate databases per service (after Phase 5):**

For production-grade isolation (independent backup/restore, independent scaling, hot-tenant dedicated DB support), each service migrates to its own PostgreSQL instance. The schema-per-service structure from Stage B makes this a `pg_dump schema | psql new_database` operation — the table structures are already isolated.

**Transition checklist for moving a schema to its own database:**

```
□ New PostgreSQL instance provisioned and accessible from the service pod
□ pg_dump -n <schema_name> source_db > schema_dump.sql
□ psql new_db < schema_dump.sql (restore into public schema of new DB)
□ Service reconnected to new DB (env var change + rolling restart)
□ Verify row counts match between old and new DB
□ Enable continuous replication (logical replication slot) for cut-over safety
□ Cut over traffic (single env var change)
□ After 48h clean window: drop old schema from monolith DB
□ Remove logical replication slot
```

### 5.2 Data Consistency During Cut-Over

The critical window is the dual-write period: both the monolith module and the extracted service are writing to the same PostgreSQL schema (Stage B) in response to the same NATS events.

**Consistency guarantee during dual-write:**

All write operations in every subscriber use `insertIfAbsent(eventId)` (for `AuditModule`) or equivalent idempotency checks. The NATS `eventId` is a UUID unique per domain event. Even if both the monolith and the new service receive the same event, only one INSERT succeeds — the other finds the existing row and returns without writing.

**For state-mutating services (WorkflowExecutionModule):**

The optimistic-lock `UPDATE ... WHERE version = $expected` is the single-writer guarantee. Two services cannot both successfully execute a transition on the same instance — only one `UPDATE` will affect a row; the other returns 0 rows and throws `409 TRANSITION_CONFLICT`. During extraction, only one service handles the `POST /workflow-instances/:id/transitions` route (controlled by Kong routing rule) — there is no dual-write for mutation operations.

### 5.3 Rollback Strategy

Every extraction step must be reversible within 5 minutes. The rollback path for each phase:

| Phase                                                | Rollback Action                                                                                                           | Time to Rollback                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Phase 2: New service deployed, dual-write active** | Disable Kong route to new service (route all traffic back to monolith module). Re-enable monolith subscriber if disabled. | < 1 minute (Kong config change, no deploy) |
| **Phase 2: Monolith module disabled**                | Re-enable monolith subscriber (uncomment + redeploy monolith). Disable new service's Kong route.                          | < 3 minutes (monolith pod restart)         |
| **Phase 2: Schema moved to new database**            | Point service back to old database (env var change + rolling restart). Verify row counts.                                 | < 5 minutes                                |
| **Phase 3: JetStream enabled**                       | Revert NATS config to core NATS mode (env var change + restart). JetStream streams remain but are not consumed.           | < 2 minutes                                |
| **Phase 4: Kong routing active**                     | Bypass Kong: update DNS to point directly to monolith load balancer.                                                      | < 5 minutes (DNS TTL dependent)            |
| **Phase 5: mTLS enforced**                           | Set `PeerAuthentication` to `PERMISSIVE` mode (allows both plaintext and mTLS). Apply the YAML change.                    | < 1 minute (kubectl apply)                 |

**The golden rollback rule:** Any change that cannot be rolled back in under 5 minutes by a single engineer without a code deployment must be redesigned. Configuration changes (env vars, Kong rules, Kubernetes YAML) are always preferred over code deployments for cut-over operations.

---

## 6. Infrastructure Decisions for the Distributed System

### 6.1 Internal Communication Protocol — NATS JetStream + gRPC

**Decision:** Two complementary protocols serve different communication needs.

**NATS JetStream** for **async domain events** (all 14 existing event types):

- Fire-and-forget from the publisher's perspective.
- Durable delivery — broker retains events until all consumers acknowledge.
- Natural fan-out: the same `workflow-execution.transition.completed` event reaches `AuditService`, `NotificationService`, and any future consumer without changing the publisher.
- Upgrade path from core NATS is configuration-only — no application code changes.

**gRPC** for **synchronous cross-service queries** (all 7 Contract Interfaces):

- Binary Protobuf encoding over HTTP/2 — significantly lower overhead than REST/JSON for high-frequency internal calls.
- Strongly typed — Protobuf schemas are the machine-checkable contract between services.
- Streaming support — gRPC bidirectional streaming is available if the snapshot delivery pattern ever needs it.
- Native NestJS support: `@nestjs/microservices` provides `@GrpcMethod()` decorator and `ClientGrpc` injection.

**Kafka is not required.** See `11-FAQ.md §Q7` for the full analysis. NATS JetStream provides durable at-least-once delivery, consumer groups, and replay — all the capabilities that Kafka would provide — within the same NATS ecosystem the application already uses. Introducing Kafka would require a completely different broker, new operational expertise, a schema registry, and a Kafka-specific client library, for no architectural benefit at this system's event volume.

### 6.2 API Gateway — Kong vs Apigee vs Amazon API Gateway vs Custom Fastify

**Decision: Kong Gateway (open-source, self-hosted)**

| Criterion            | Kong                                                       | AWS API Gateway             | Apigee                  | Custom Fastify         |
| -------------------- | ---------------------------------------------------------- | --------------------------- | ----------------------- | ---------------------- |
| **Deployment model** | Self-hosted / Kubernetes Ingress                           | Fully managed (AWS)         | Fully managed (Google)  | Self-hosted            |
| **JWT validation**   | Plugin (first-class)                                       | Lambda authoriser           | OAuth/OIDC              | Hand-rolled            |
| **Rate limiting**    | Rate Limiting Advanced plugin (Redis-backed, tenant-aware) | Usage Plans (coarse)        | Quota policies          | Hand-rolled            |
| **Traffic routing**  | Declarative `deck` YAML                                    | AWS console / Terraform     | GCP console             | Hand-rolled            |
| **Cost at scale**    | Fixed infrastructure cost                                  | Per-request ($3.50/million) | Per-call + subscription | Engineer time to build |
| **Vendor lock-in**   | None                                                       | AWS                         | Google                  | None                   |
| **Plugin ecosystem** | 100+ plugins                                               | Limited                     | Extensive               | N/A                    |
| **Recommendation**   | ✅ **Primary choice**                                      | Secondary (if AWS-native)   | Not recommended         | Not recommended        |

**Why not custom Fastify gateway:** Building an API gateway from scratch means implementing JWT validation, rate limiting (with Redis), request routing, circuit breaking, health checking, CORS, TLS termination, and an admin API — weeks of engineering work that provides no product value. Kong provides all of this in a configuration file.

**Why not Apigee:** Apigee's strength is enterprise developer portals, API monetisation, and Google Cloud integration. This system does not need any of those features at this stage, and Apigee's pricing is structured for large enterprises.

**AWS API Gateway** is a legitimate secondary choice if the entire stack is deployed on AWS (EKS, RDS, ElastiCache). Its managed nature eliminates operational overhead, but per-request pricing at high volume (>10 million requests/day) exceeds the cost of running Kong on a small EC2 or EKS node.

### 6.3 Load Balancer — NGINX vs HAProxy vs AWS ALB

**Decision: NGINX Ingress Controller (Kubernetes) for self-hosted; AWS ALB Ingress Controller for AWS EKS.**

| Criterion                                | NGINX Ingress                                                      | HAProxy                                                         | AWS ALB                                                      |
| ---------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| **Kubernetes integration**               | Native Ingress Controller — `kubectl apply`                        | Requires custom controller                                      | Native ALB Ingress Controller (AWS Load Balancer Controller) |
| **HTTP/2 and gRPC**                      | Supported via `nginx.ingress.kubernetes.io/backend-protocol: GRPC` | Supported                                                       | Supported (HTTP/2 enabled)                                   |
| **Sticky sessions**                      | Supported (not needed for this system)                             | Supported                                                       | Supported                                                    |
| **TLS termination**                      | Cert-manager integration                                           | Manual cert management                                          | ACM (AWS Certificate Manager) — zero-ops                     |
| **Throughput at high connection counts** | Excellent                                                          | Slightly higher than NGINX at extreme connection counts (>100k) | Managed — no capacity concern                                |
| **Operational overhead**                 | Low (Helm chart)                                                   | Medium                                                          | Zero (managed)                                               |
| **Recommendation**                       | ✅ Self-hosted / GKE / EKS                                         | Not recommended (marginal gain not worth the complexity)        | ✅ AWS EKS                                                   |

**Why not HAProxy:** HAProxy's raw throughput advantage over NGINX manifests at extreme connection counts (>100,000 simultaneous connections). At this system's scale, NGINX performs identically while having a significantly simpler configuration model and first-class Kubernetes Ingress Controller support.

The existing `app.set('trust proxy', 1)` setting in `main.ts` correctly handles client IP extraction behind any of these load balancers.

### 6.4 Observability Stack

**Decision: Prometheus + Grafana (metrics) + Loki (logs) + Tempo (traces) + Sentry (error tracking)**

This is the **Grafana OSS stack** — all four tools are natively integrated within Grafana's UI, enabling log-metric-trace correlation from a single pane.

| Tool                    | Role                                     | Why Chosen Over Alternatives                                                                                         |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Prometheus**          | Metrics collection (pull-based scraping) | De-facto Kubernetes standard; `ServiceMonitor` CRDs auto-discover pods; PromQL is powerful for SLO queries           |
| **Grafana**             | Dashboards and alerting                  | Native data source integrations for Prometheus, Loki, and Tempo; free for self-hosted                                |
| **Grafana Loki**        | Log aggregation                          | Index-free (cheaper than ELK at scale); label-based queries match Prometheus conventions; native Grafana integration |
| **SigNoz or New Relic** | Distributed tracing                      | Zero-overhead, no-index trace storage; native TraceQL queries; integrates with OpenTelemetry SDK output              |
| **Sentry**              | Error tracking and alerting              | Best-in-class for unhandled exception grouping, stack traces, and release tracking; `@sentry/nestjs` integration     |

**Why not ELK Stack (Elasticsearch + Logstash + Kibana):** Elasticsearch is operationally heavy — cluster sizing, shard management, and index lifecycle policies require dedicated ops attention. Loki's label-based approach stores log metadata (not content) in an index, dramatically reducing storage costs and operational complexity. For a team without dedicated SREs, Loki is the right choice.

**Why not Datadog or New Relic:** Both are excellent commercial APM platforms. The primary reason not chosen: per-host or per-user pricing becomes expensive as the service count and engineer count grows. The Grafana OSS stack provides equivalent capability at infrastructure cost only. Datadog should be re-evaluated when the team exceeds 15 engineers and dedicated on-call rotation justifies its automation features.

**Why not AWS CloudWatch / X-Ray:** Strong choice if the entire stack is AWS-native. X-Ray's distributed tracing integrates natively with ECS, Lambda, and RDS. The downside: tighter AWS lock-in, CloudWatch Insights query language is less flexible than PromQL/LogQL, and X-Ray's sampling model requires careful configuration to avoid missing low-frequency traces.

### 6.5 Deployment Strategy — CI/CD, Blue-Green, Canary

**Decision:** Rolling deployments as default; Blue-Green for DB-breaking schema changes; Canary for high-risk behavioural changes.

**Per-service CI/CD pipelines:**

After microservice extraction, each service has its own GitHub Actions workflow triggered by changes to its directory (`apps/<service-name>/`). A change in `NotificationService` does not trigger a `WorkflowExecutionService` build.

```yaml
# .github/workflows/notification-service.yml
on:
  push:
    paths:
      - "apps/notification/**"
      - "libs/shared/**" # shared lib changes affect all services

jobs:
  test:
    steps:
      - run: bun test apps/notification/
      - run: bun run test:e2e apps/notification/
  build:
    steps:
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/notification/Dockerfile
          tags: registry/notification-service:${{ github.sha }}
  deploy:
    steps:
      - run: |
          kubectl set image deployment/notification-service \
            notification-service=registry/notification-service:${{ github.sha }}
          kubectl rollout status deployment/notification-service
```

**Deployment strategy selection matrix:**

| Scenario                          | Strategy                       | Rationale                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal feature release            | **Rolling**                    | Replace pods one at a time (maxSurge: 1, maxUnavailable: 0). Zero-downtime. The stateless design makes any pod safe to terminate.                                                                                                                                                                                   |
| Database schema migration         | **Blue-Green**                 | Old (Blue) environment stays live. New (Green) environment with migrated schema is deployed alongside. Migration must be backward-compatible (additive only) to allow both Blue and Green to share the DB simultaneously. After smoke tests pass, route 100% to Green. Blue kept warm for 24h for instant rollback. |
| Execution engine behaviour change | **Canary**                     | Route 5% of `workflow-execution.transition` traffic to the Canary pod. Monitor error rate and P99 latency. Promote to 100% after 1 hour of clean metrics, or roll back by removing the Canary pod. Argo Rollouts automates the promotion/rollback decision.                                                         |
| A/B testing                       | **Not applicable for backend** | A/B testing is a frontend / product experimentation concern. Backend services serve deterministic API contracts; experimentation happens at the feature flag / UI layer.                                                                                                                                            |

**Blue-Green database migration requirements:**

Database migrations during Blue-Green must follow the **expand-contract** pattern:

1. **Expand migration** (deployed with Green): Add new column as nullable (`ALTER TABLE ... ADD COLUMN new_col TEXT`). Both Blue and Green can write — Blue ignores the column; Green writes to it.
2. **Backfill** (batch process after Green is live): Populate `new_col` for all existing rows.
3. **Contract migration** (deployed in a subsequent release): Apply NOT NULL constraint. Drop old column if replacing.

Never add a NOT NULL column without a default in a Blue-Green migration — Blue's writes will fail the constraint.

---

## 7. Operating the Distributed System

### 7.1 Managing Complexity

Microservices complexity is managed through organisation, tooling, and convention — not through reducing the number of services.

| Strategy                              | Implementation                                                                                                                                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service ownership**                 | Each bounded context is owned by one engineer or one small team. Ownership means: that person writes, deploys, monitors, and is on-call for that service. Ownership is documented in the service's `CODEOWNERS` file.                                           |
| **Internal developer portal**         | Backstage (or a simpler wiki) catalogues every service: its owner, its API contract, its runbook, its SLOs, its downstream dependencies. New engineers find the service catalogue before reading source code.                                                   |
| **Contract testing (Pact)**           | Consumer-driven contract tests run in CI for every service pair with a gRPC dependency. A breaking change to `AuthService`'s `findById` gRPC method fails the `WorkflowExecutionService` Pact provider test before the breaking change reaches production.      |
| **API versioning**                    | All gRPC services are versioned in the Protobuf package name (`package auth.v1`). All HTTP APIs include a version prefix (`/api/v1/`). Old versions are deprecated with a minimum 30-day notice period before removal.                                          |
| **Strangler Fig for feature changes** | Even within a microservice architecture, feature changes use the Strangler Fig principle: add the new behaviour alongside the old; migrate traffic incrementally; remove the old behaviour only after all consumers are confirmed migrated.                     |
| **Mono-repo**                         | All services remain in the same repository. Shared code (`libs/shared/`, Protobuf definitions, `docker-compose.yml` for local dev) is co-located. A cross-cutting change (adding `traceId` to all event interfaces) is one PR, not 7 PRs across 7 repositories. |

### 7.2 Ensuring Performance

| Risk                                       | Mitigation                                                                                                                                                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Network latency added by gRPC calls**    | gRPC over HTTP/2 multiplexed connections adds ~1–3 ms per call on a local cluster network. The LONG/IMMUTABLE Redis cache layer (snapshot, definition, user summary) means most high-frequency reads never reach the gRPC call at all.                                |
| **Snapshot read bottleneck**               | `WorkflowDefinitionService` caches `wf-def:{tenantId}:def:{id}:snapshot:v{N}` with `IMMUTABLE` TTL (24 hours). 10,000 active instances running against the same definition version require at most 1 DB query per 24-hour window per snapshot.                        |
| **Per-service connection pool exhaustion** | Each service gets its own PostgreSQL connection pool (`max: 20`). PgBouncer is required when pod count × 20 > PostgreSQL's `max_connections`. Deploy PgBouncer as a sidecar or shared cluster resource.                                                               |
| **Cold start latency**                     | NestJS on Bun starts in ~200 ms. Kubernetes `readinessProbe` using `/health/ready` ensures traffic only reaches pods after they have established their DB and Redis connections (`/health/ready` returns 200 only after TypeORM `DataSource.initialize()` completes). |
| **NATS consumer lag**                      | Monitor `nats-server`'s JetStream consumer pending count. If `AuditService` consumer lag grows, scale `AuditService` pods — it is independently scalable from all other services. Alert when pending > 1000 messages for more than 5 minutes.                         |
| **Cross-service P99 regression**           | Each service defines its own P99 SLO in Grafana. A regression in `WorkflowDefinitionService`'s snapshot endpoint is surfaced on `WorkflowExecutionService`'s overall P99 — distributed tracing makes the contribution of each service to the overall latency visible. |

### 7.3 Ensuring Resilience and High Availability

| Strategy                            | Implementation                                                                                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Minimum 2 replicas per service**  | `minReplicas: 2` in all production `Deployment` specs. No single pod is a SPOF. `PodDisruptionBudget: maxUnavailable: 1` ensures at least one pod is always available during node drain.                                                                           |
| **Circuit breaker on gRPC clients** | Wrap every `gRPC client.callMethod()` with `opossum` (or `nestjs-circuit-breaker`). An open circuit returns a cached response or a graceful `503` — it does not cascade the failure to the calling service's health check.                                         |
| **Database HA**                     | PostgreSQL in managed HA configuration (Render Postgres HA or AWS RDS Multi-AZ). Automatic failover < 30 seconds. Connection pools automatically reconnect after failover using `retryAttempts: 3, retryDelay: 3000` in the ORM config.                            |
| **Redis Sentinel / Redis Cluster**  | Redis Sentinel provides automatic failover for the cache and rate limit state. A Redis failover causes a brief window (< 30s) of unconstrained requests — acceptable given `ThrottlerGuard` backup layer remains active.                                           |
| **NATS JetStream cluster**          | 3-node cluster with Raft consensus. Message durability across single-node failures. Quorum-based leader election ensures no split-brain.                                                                                                                           |
| **Graceful shutdown**               | Each service responds to `SIGTERM` by: stopping accepting new requests (readiness probe fails), finishing in-flight requests (30s drain window), closing DB pool, disconnecting NATS. Kubernetes sends `SIGTERM` before forcibly killing the pod.                  |
| **Health probes**                   | Liveness (`/health`): checks that the process is alive and not deadlocked. Readiness (`/health/ready`): checks DB connectivity and Redis connectivity before accepting traffic. A pod failing readiness is removed from the load balancer without being restarted. |
| **Multi-AZ deployment**             | Kubernetes `topologySpreadConstraints` distributes pods across availability zones. A single AZ outage does not take down any service.                                                                                                                              |

### 7.4 Ensuring Security

| Concern                                | Strategy                                                                                                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service-to-service authentication**  | mTLS via Istio sidecar (§3.5.2). All gRPC and HTTP calls between pods are encrypted and mutually authenticated. A compromised pod cannot impersonate another service.                                                                     |
| **JWT validation at gateway**          | Kong JWT plugin validates tokens before any service pod processes the request. Services trust Kong-injected `X-*` headers. `JWT_SECRET` is held only by Kong.                                                                             |
| **Tenant isolation in distributed DB** | Each service's PostgreSQL instance contains only that service's data. Cross-service DB access is structurally impossible — no shared schema, no shared connection string. RLS policies remain active in each service's database.          |
| **Secret management**                  | Each service's `Deployment` manifest references `secretKeyRef` pointing to Kubernetes `Secret` objects, populated from AWS Secrets Manager or Vault. No plaintext secrets in environment variables, Dockerfiles, or version control.      |
| **Network policies**                   | Kubernetes `NetworkPolicy` restricts which pods can communicate. `WorkflowExecutionService` can reach `AuthService` (gRPC) and NATS — it cannot reach `NotificationService` directly. Lateral movement after a pod compromise is blocked. |
| **Container image scanning**           | GitHub Actions CI runs Trivy or Snyk on every Docker image build. Images with CRITICAL severity CVEs are blocked from deployment.                                                                                                         |
| **Audit log integrity**                | `AuditService` is the sole writer of `audit_logs`. The PostgreSQL trigger blocking UPDATE/DELETE remains. No other service has write access to the `audit` database. Audit records are mathematically immutable after creation.           |

### 7.5 Ensuring Scalability

| Lever                                       | Implementation                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Horizontal Pod Autoscaling (HPA)**        | Kubernetes HPA scales pods based on CPU utilisation (target: 70%) or custom metrics (request rate via Prometheus adapter). `WorkflowExecutionService` scales independently from `AuthService`. Define independent HPA per service.                                                                                 |
| **Independent scaling per bounded context** | The highest-volume service (`WorkflowExecutionService`) runs `min: 3, max: 20` replicas. `AuditService` (lower throughput, I/O-bound) runs `min: 2, max: 5`. Services are not locked to the same pod count.                                                                                                        |
| **Immutable snapshot cache**                | Version snapshots cached with 24-hour IMMUTABLE TTL in Redis. Regardless of how many `WorkflowExecutionService` pods are running or how many transitions per second are executing, each snapshot requires at most 1 DB read per 24 hours.                                                                          |
| **Database partitioning**                   | `audit_logs`: monthly time partitioning. `workflow_instances`: hash partitioning by `tenant_id` (16 buckets). Each partition is independently vacuumed, indexed, and archived. See `08-SCALABILITY-PERFORMANCE.md §9.2`.                                                                                           |
| **Hot-tenant dedicated DB**                 | Enterprise tenants with extreme data volume are migrated to dedicated PostgreSQL instances. The `TENANT_QUERY_CONTRACT.getPlan()` call in `DatabaseContextInterceptor` selects the appropriate `DataSource` at request time. `tenant_settings.dedicated_db_url` stores the connection string for eligible tenants. |
| **Read replicas for query-heavy services**  | CQRS `@QueryHandler` classes (`GetInstanceListHandler`, `GetInstanceDetailHandler`) inject a dedicated `READ_DATASOURCE`. Write `@CommandHandler` classes inject the primary `DataSource`. Adding a read replica is a configuration change — no business logic changes.                                            |

### 7.6 Ensuring Maintainability

| Practice                                       | Detail                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mono-repo with bounded service directories** | `apps/<service-name>/` per service. Shared libraries in `libs/`. One `package.json` at the root. `bun install` installs all dependencies for all services. Engineers can make cross-cutting changes (update shared event interfaces, bump a shared dependency) in one PR. |
| **Per-service CI/CD with path filters**        | GitHub Actions `on.push.paths` triggers only the pipelines for the services whose directories changed. An unrelated `NotificationService` change does not trigger `WorkflowExecutionService` tests.                                                                       |
| **Trunk-based development**                    | Short-lived feature branches (< 1 day); merge to `main` frequently. Feature flags (`tenant_feature_flags` table) control production exposure of in-progress features without long-running branches.                                                                       |
| **Automated dependency updates**               | Dependabot or Renovate creates weekly PRs for dependency updates. Security patches (Dependabot `security` alerts) are merged within 24 hours.                                                                                                                             |
| **Database migration ownership**               | Each service owns its migration files. No service runs another service's migrations. Schema changes are reviewed in the same PR as the code change that requires them.                                                                                                    |
| **Runbooks per service**                       | Each service has a `RUNBOOK.md` in its directory covering: how to restart safely, what its health check checks, alert response procedures, rollback procedure, common failure modes.                                                                                      |

### 7.7 Ensuring Observability

| Concern                         | Tool / Pattern                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **End-to-end request tracing**  | OpenTelemetry SDK in every service. `traceId` propagated via HTTP `traceparent` header and NATS event metadata. Grafana Tempo stores and queries traces. A single `traceId` shows the full path: API Gateway → AuthService (JWT validation) → WorkflowExecutionService (transition) → NATS event → AuditService (audit log write). |
| **Structured log correlation**  | Winston JSON logs include `{ traceId, tenantId, userId, serviceName, level, message, duration }`. Grafana Loki queries such as `{serviceName="workflow-execution"} \|= "traceId=abc123"` show all log lines for a single request across service restarts.                                                                          |
| **Service-level metrics**       | Each service exposes `/metrics` (Prometheus format) via `@willsoto/nestjs-prometheus`. Standard metrics include `http_request_duration_seconds` (histogram), `http_requests_total` (counter), `db_pool_active_connections` (gauge), and `nats_messages_processed_total` (counter).                                                 |
| **NATS JetStream consumer lag** | `nats-server` exposes a monitoring HTTP endpoint (`/jsz`). Prometheus scrapes consumer `num_pending` per subject. Alert when lag grows beyond a threshold — signals a subscriber falling behind under load.                                                                                                                        |
| **gRPC call latency**           | Istio Envoy sidecar records gRPC call latency between services automatically. Grafana Service Graph visualizes inter-service latency heatmaps to identify bottlenecks in slow requests.                                                                                                                                            |
| **Business-level metrics**      | Custom Prometheus counters such as `workflow_transitions_total{status="success\|failed", tenant_id}` and `workflow_instances_created_total{definition_id}` surface product health alongside infrastructure health in the same Grafana dashboard.                                                                                   |

### 7.8 Ensuring Testability

| Test Type                 | Strategy                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit tests**            | Each service runs `vitest` unit tests covering command handlers, query handlers, and domain services in isolation. Repositories and Redis are mocked via `@nestjs/testing`. Run time: < 30 seconds.                                                                                                                                                            |
| **Integration tests**     | Each service's integration tests run against a real PostgreSQL (with migrations applied) and real Redis via GitHub Actions `services`. They cover: RLS policy enforcement (verify cross-tenant row access is blocked), idempotency logic (verify duplicate event processing produces one row), and optimistic locking (verify concurrent transition attempts). |
| **Contract tests (Pact)** | Pact consumer tests run in the downstream service's CI. Pact provider tests run in the upstream service's CI. The Pact broker stores the contract matrix. A breaking API change to `AuthService`'s `findById` fails the `WorkflowExecutionService` consumer test before the change merges.                                                                     |
| **End-to-end tests**      | `tests/e2e/` directory contains a docker-compose-based test suite that spins up all services + PostgreSQL + Redis + NATS. The E2E suite covers the canonical happy path: register tenant → create user → create workflow → publish → create instance → execute transition → verify audit log. Run on every PR to `main`.                                       |
| **Load tests**            | `k6` or `autocannon` load test scripts run weekly against a staging environment. Metrics: P99 transition execution time under 500 concurrent users, Redis hit rate under sustained load, NATS JetStream consumer lag growth rate. Results are committed to the repository as baseline benchmarks.                                                              |
| **Chaos testing**         | Chaos Monkey (or Chaos Mesh on Kubernetes) randomly kills service pods, delays NATS messages, and injects Redis timeouts. Verifies: graceful degradation (Redis down → DB fallback), NATS message replay (pod killed mid-event → JetStream re-delivers), circuit breaker opening (gRPC service slow → fallback response).                                      |

### 7.9 Ensuring Governance and Compliance

| Concern                     | Strategy                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Immutable audit trail**   | `AuditService` is the sole writer of `audit_logs`. The PostgreSQL trigger (`BEFORE UPDATE OR DELETE ... RAISE EXCEPTION`) remains active in `AuditService`'s dedicated database. No API endpoint exposes a write path to `audit_logs`. The `eventId` uniqueness constraint prevents duplicate rows on event replay.                 |
| **GDPR — right to erasure** | A "delete tenant" operation publishes a `tenant.deactivated` NATS event (already implemented) plus a new `tenant.gdpr-erasure-requested` event. Each service subscribes and deletes its tenant-scoped rows (except `audit_logs`, which may be subject to retention requirements overriding GDPR erasure requests per legal review). |
| **Data residency**          | Services running in a specific geographic region handle only tenants whose data residency requirement matches that region. Kong routing rules direct traffic based on the `tenantSlug` → region mapping stored in `tenant_settings.data_region`.                                                                                    |
| **Access control audit**    | Every role assignment change emits `auth.user.roles-updated` (already implemented). `AuditService` persists it with `actorEmail`, `actorRole`, and the new `roles[]` array. The audit record is traceable from the HTTP request `traceId` to the DB write.                                                                          |
| **Secret rotation**         | Vault or AWS Secrets Manager enables secret rotation without redeployment. `JWT_SECRET` rotation: Kong is updated with the new secret; both old and new secrets are accepted during a 15-minute overlap window (matches JWT access token expiry); old secret removed after the window.                                              |
| **Compliance reporting**    | `AuditService` exposes a `GET /audit-logs` endpoint with time-range and tenant filtering. Compliance exports (CSV, JSON) are generated server-side and streamed — no full table dumps are exposed via API.                                                                                                                          |

### 7.10 Ensuring Extensibility

The architecture remains extensible after microservice extraction because the extension points are in the **shared contract layer**, not in individual services.

| Extension Type                           | How to Add                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **New workflow rule type**               | Add `CustomRuleStrategy` enum value in `libs/shared/.../rule-engine.contract.ts`. Implement strategy in `RuleEngineService`. No other service changes. `RULE_ENGINE_CONTRACT` interface is unchanged.                                                                                                                    |
| **New domain event**                     | Add event name to `NatsEvents` enum. Add Protobuf message to `libs/shared/proto/`. Add payload interface. Publisher publishes; subscribers opt-in. Zero changes to existing subscribers.                                                                                                                                 |
| **New bounded context / service**        | Define Contract Interface in `libs/shared/src/interfaces/contracts/`. Create `apps/<new-service>/`. Register the service in Kong. The new service is isolated from day one — no existing service is coupled to it.                                                                                                       |
| **New notification channel**             | Add `NotificationChannel` enum value. Implement delivery adapter in `NotificationService`. Existing email and webhook channels are unaffected. The new channel is available to all tenants via a feature flag toggle in `tenant_feature_flags`.                                                                          |
| **New tenant plan tier**                 | Add value to `TenantPlan` enum. Update `TenantQueryService.getPlan()`. Update JWT payload population. Feature flags per tenant enable granular rollout without code deployment.                                                                                                                                          |
| **New authentication method (SSO/SAML)** | Add a new auth strategy to `AuthService` (NestJS Passport strategy pattern). The `USER_QUERY_CONTRACT` and JWT payload shape remain unchanged — consuming services are unaffected.                                                                                                                                       |
| **Third-party connector**                | New connectors (Slack, Salesforce, ERP systems) are implemented as separate connector services. They subscribe to NATS events and call external APIs. They have no access to internal service databases. The `NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT` pattern can be extended to support connector-specific templates. |

---

## 8. Troubleshooting

| Problem                                                                                        | Likely Cause                                                                                                                                                                                         | Resolution                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`409 TRANSITION_CONFLICT` errors spike after deploying new `WorkflowExecutionService` pods** | New pods start with empty Redis; the `allowedTransitions` cache misses cause extra DB reads which slow response time, increasing the window for concurrent requests to hit the same instance version | Pre-warm the cache before routing traffic: run a warm-up script that GETs active instance details via the internal health check. Consider a staged rollout (Canary 10% first).                                                                                                                                                                           |
| **Audit logs missing for a time window after NATS JetStream migration**                        | JetStream stream was created with `WorkQueuePolicy` (delete on ack) and a subscriber acknowledged events before `AuditService` processed them; or the stream `MaxAge` caused retention to expire     | Switch to `InterestPolicy` for streams with multiple consumer groups. Verify each consumer group has its own durable consumer name. Check JetStream stream retention configuration.                                                                                                                                                                      |
| **gRPC `UNAVAILABLE` errors from `WorkflowExecutionService` to `WorkflowDefinitionService`**   | `WorkflowDefinitionService` pods are not ready (failing readiness probe); or Kubernetes DNS has not propagated after a pod restart; or the circuit breaker has opened due to previous failures       | Check `kubectl get pods -n default` for `WorkflowDefinitionService` pod status. Check circuit breaker state via the admin endpoint. Verify Kubernetes DNS: `kubectl exec <pod> -- nslookup workflow-definition-service`.                                                                                                                                 |
| **Tenant A can read Tenant B's data after schema extraction**                                  | A service was deployed without `SET LOCAL app.tenant_id` in the `DatabaseContextInterceptor`; or the RLS policy was inadvertently dropped during a schema migration                                  | Verify `SHOW row_security` returns `on` for the affected table. Re-apply the RLS policy from `1772830604496-Create-RLS-Policies.ts`. Check `DatabaseContextInterceptor` is registered in the extracted service's `AppModule`.                                                                                                                            |
| **NATS JetStream consumer lag growing unboundedly for `AuditService`**                         | `AuditService` is under-provisioned — event rate exceeds its processing throughput; or `AuditLogRepository.insertIfAbsent()` is slower than expected due to missing index on `event_id`              | Scale `AuditService` pods (HPA). Verify `CREATE UNIQUE INDEX ON audit_logs(event_id)` exists. Check PostgreSQL query time via `maxQueryExecutionTime` logging.                                                                                                                                                                                           |
| **Kong returning `401` for valid tokens after `JWT_SECRET` rotation**                          | Old tokens signed with the previous secret are still within their 15-minute validity window but the new secret has been applied to Kong                                                              | During JWT_SECRET rotation, configure Kong's JWT plugin to accept both the old and new secrets simultaneously for the duration of the JWT access token validity window (15 minutes). Remove the old secret after the window expires.                                                                                                                     |
| **Rolling deployment causes request failures during pod termination**                          | Kubernetes sends `SIGTERM` to the pod but the load balancer still routes traffic to it for a few seconds after                                                                                       | Add a `preStop` lifecycle hook with `sleep 5` to give the load balancer time to drain the pod before the process starts shutdown. Verify `terminationGracePeriodSeconds: 30` in the Deployment spec.                                                                                                                                                     |
| **Shadow table (`we_user_shadows`) out of sync after `AuthService` extraction**                | NATS events from `AuthService` were lost during the extraction cut-over window (core NATS, at-most-once)                                                                                             | Run a reconciliation job: `SELECT users.id FROM users LEFT JOIN we_user_shadows ws ON users.id = ws.id WHERE ws.id IS NULL` — for each missing shadow, publish a synthetic `auth.user.created` event or directly upsert the shadow row. After JetStream migration, this is prevented by durable consumer replay.                                         |
| **Contract test failing after adding a new field to a gRPC response**                          | Protobuf field added as required (proto3 removes `required` keyword, but a consuming service compiled against an old `.proto` may not have the new field)                                            | In Protobuf proto3, all fields are optional by default. The consuming service's generated stub simply ignores unknown fields — this is backward-compatible. The contract test failure indicates the Pact broker's expected response schema needs updating. Run `pact publish` to push the new contract.                                                  |
| **`/health/ready` failing on all pods simultaneously after DB failover**                       | PostgreSQL Multi-AZ failover completed but the connection pool has cached the old primary's IP; TypeORM's `retryAttempts: 1, retryDelay: 3000` config limits automatic reconnection attempts         | Increase `retryAttempts: 5` in the ORM config. Rely on the PgBouncer tier (if deployed) to absorb the failover window — PgBouncer retries the connection to the new primary automatically. Kubernetes readiness probe failure temporarily removes pods from load balancer rotation; liveness probe does not restart them during a transient DB failover. |

---

## 9. Post-Migration Checklist

Use this checklist after each service extraction and again after full microservice migration is complete.

### Per-Service Extraction Checklist

```
Service extracted: ____________________    Date: ____________________

Architecture
  □ Service runs as independent NestJS application in apps/<service-name>/
  □ Service has its own Dockerfile and docker-compose.dev.yml entry
  □ Service's tables have been moved to a dedicated PostgreSQL schema
  □ Service has a dedicated PostgreSQL role with schema-scoped permissions
  □ No entity from this service is imported by any other service's code
  □ No repository from this service is injected into any other service
  □ All cross-service reads use Contract Interface gRPC calls
  □ All cross-service side effects use NATS JetStream events

Deployment
  □ Service has its own GitHub Actions CI/CD pipeline
  □ Service Deployment manifest includes: minReplicas: 2, resource requests/limits
  □ Service has a PodDisruptionBudget (maxUnavailable: 1)
  □ Service has a HorizontalPodAutoscaler (target CPU: 70%)
  □ Rolling deployment configured: maxSurge: 1, maxUnavailable: 0
  □ Readiness probe configured: GET /health/ready, initialDelaySeconds: 10
  □ Liveness probe configured: GET /health, initialDelaySeconds: 30
  □ SIGTERM graceful shutdown verified (preStop hook: sleep 5)

Observability
  □ Service exposes /metrics Prometheus endpoint
  □ Grafana dashboard created for service (request rate, P99, error rate, DB pool)
  □ Service logs include: traceId, tenantId, userId, serviceName in every line
  □ Distributed traces visible in Grafana Tempo for this service
  □ Sentry project created for this service; unhandled exceptions captured
  □ Alerts configured: error rate > 1%, P99 > 1s for 5 min, pod crash loop

Security
  □ mTLS enforced via Istio PeerAuthentication (STRICT mode)
  □ Kong routing rule created for this service's endpoints
  □ NetworkPolicy restricts incoming traffic to Kong and authorised services only
  □ Service reads secrets from Secrets Manager (not plaintext env vars)
  □ Docker image scan (Trivy) passing with no CRITICAL CVEs

Testing
  □ Unit test suite passes in CI
  □ Integration tests pass against real DB (RLS policies verified)
  □ Pact contract tests green (provider and consumer)
  □ E2E test suite updated to include this service's routes
  □ Load test baseline updated

Operations
  □ RUNBOOK.md written and reviewed (restart procedure, alerts, rollback)
  □ Monolith module disabled and removed from src/
  □ Old module's tables removed from monolith DB schema (after 48h clean window)
  □ Team notified: service is live, on-call rotation updated
```

### Full Migration Completion Checklist

```
□ All modules have independent CI/CD pipelines
□ No shared database tables across services (each service has its own schema/DB)
□ Distributed tracing operational — traceId visible end-to-end in all service logs
□ API gateway (Kong) health checks passing for all services
□ Pact contract tests green for all service pairs
□ Runbooks written per service (all 7 services)
□ NATS JetStream migration complete — core NATS no longer used
□ mTLS enforced between all services (Istio PeerAuthentication: STRICT)
□ HPA configured and validated for all services (scale-up test run)
□ PodDisruptionBudget configured for all services
□ Multi-AZ deployment verified (pod spread across zones confirmed)
□ Redis Sentinel or Cluster operational (no single Redis SPOF)
□ PostgreSQL HA (Multi-AZ) confirmed for all service databases
□ Secrets Manager integration complete (no .env files in production)
□ Container image scanning passing for all service images
□ Load test baseline established for all services under target concurrent user load
□ Chaos test run completed (pod kill, network delay, Redis failure scenarios)
□ On-call rotation covers all 7 services
□ Architecture decision records (ADRs) updated to reflect final service topology
□ This Migration Guide updated to reflect any deviations from the plan
```

---

_Document 10 of 13 — Migration Guide: Modular Monolith → Microservices_  
_Cross-reference: `01-SYSTEM-ARCHITECTURE.md` for current module boundaries, `04-DOMAIN-MODEL-DDD.md` for bounded context map, `08-SCALABILITY-PERFORMANCE.md §9` for extraction priority rationale, `11-FAQ.md §Q21–Q36` for concise answers to all microservice infrastructure questions_
