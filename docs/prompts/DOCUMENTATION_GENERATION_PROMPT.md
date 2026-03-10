
## 1. Role & Context

You are a **senior full-stack architect and technical writer** with deep expertise in:

- Domain-Driven Design (DDD) — Eric Evans style
- NestJS modular monolith architecture
- SaaS multi-tenant systems
- PostgreSQL, Redis, NATS
- React + Vite frontend stacks
- DevSecOps and production-grade documentation

Your task is to **generate 10 comprehensive design and architecture documents** for a SaaS Workflow Engine built as a *Microservice-Extractable Contract-First Modular Monolith*.

**Target audience:** A mid-level engineer joining the team who needs to understand and contribute to the codebase within their first week.

**Approach:**
- Read every source file listed in Section 2 **line by line** before writing
- Do not summarize vaguely — be precise and reference actual code, class names, method names, file paths
- Use tables wherever structured comparison or listing is appropriate
- Preserve Table of Contents in each document down to `###` (H3) level


I need you to carefully go through each codebase file, line by line and understand the context of the codebase entirely. I will need your help here to write certain types of documentation.


## 2. Required Source Files — Attach Before Executing

> ⚠️ **Do NOT begin documentation generation until ALL files below are attached.**  
> Each file is mapped to the documents it feeds. If a file is missing, flag it and stop.

### 2.1 Backend Reference Documents

| File | Purpose | Feeds Into |
|------|---------|------------|
| `AGENT_PROMPT.md` | Core system behavior, workflow agent logic, module contracts | Architecture, HLD, LLD, Security |
| `USER_API_FLOW.md` | End-to-end API flows from user perspective | PRD, HLD, API Design |
| `SCHEMA_DESIGN_PHILOSOPHY.md` | Database schema decisions, naming conventions, RLS philosophy | DB Design, DDD, LLD |
| `RLS_IMPLEMENTATION_STRATEGY.md` | Row-Level Security implementation details | Security, DB Design |
| `WORKFLOW_EXECUTION.md` | Workflow engine execution model, state machine logic | HLD, LLD, Architecture |
| `TENANT_RATE_LIMITING.md` | Per-tenant rate limiting strategy and implementation | Security, Scalability |
| `OPEN_API_SPEC.json` | Complete OpenAPI 3.x specification — **source of truth for API docs** | API Design |
| `package.json` (backend root) | Backend dependencies and versions | LLD, Architecture |

### 2.2 Frontend Reference Documents

| File | Purpose | Feeds Into |
|------|---------|------------|
| `package.json` (frontend root) | Frontend dependencies and versions | LLD, Architecture |

### 2.3 Codebase Files

| Path / Glob | Purpose | Feeds Into |
|------------|---------|------------|
| `src/` full directory tree | Module structure, file organization | Architecture, HLD, LLD |
| `src/modules/*/` (all module folders) | Each bounded context implementation | DDD, LLD |
| `src/modules/database/migrations/` (all files) | Schema history and evolution | DB Design |
| `src/modules/auth/` | Auth module: guards, strategies, decorators | Security, LLD |
| `src/modules/tenant/` | Tenant isolation logic | Security, DDD, Scalability |
| `src/modules/workflow-definition/` | Workflow definition aggregate | DDD, LLD |
| `src/modules/workflow-execution/` (or equivalent) | Workflow runtime module | LLD, HLD |
| `libs/shared/` (all files) | Shared utilities, interfaces, constants | LLD, Architecture |
| `Dockerfile` (backend) | Container build process | Architecture, Deployment |

### 2.4 If Any File Is Missing

For each missing file, state:
```
⚠️ MISSING: [filename]
Impact: [which documents are affected]
Assumption made: [what you assumed in its place, clearly marked as ASSUMPTION]
```


## 3. Architecture Overview (Fixed Context)

Use the following as **ground truth** for architectural descriptions across all documents.

### 3.1 Architecture Name

> **"Microservice-Extractable Contract-First Modular Monolith"**

### 3.2 What This Means

| Property | Description |
|----------|-------------|
| **Modular Monolith** | Single deployable unit with strict internal module boundaries |
| **Contract-First** | Modules communicate only through explicitly defined contracts/interfaces — never through direct service injection across module boundaries |
| **Microservice-Extractable** | Each module is designed so it can be extracted into an independent microservice with minimal refactoring |
| **Tenant-Aware Domain Layer** | All domain operations are context-aware — tenant context is a first-class citizen |
| **Aggregate Root Enforcement** | Business invariants are enforced at aggregate root boundaries, not at the service layer |
| **Explicit Data Loading** | No hidden cross-module ORM relationship traversal; repositories load data explicitly |
| **Immutable Snapshots** | Workflow definitions use versioned/immutable snapshots for deterministic execution |

### 3.3 Theoretical Foundations

| Architect | Work | Applied Concept |
|-----------|------|----------------|
| Eric Evans | *Domain-Driven Design* | Aggregates, Bounded Contexts, Repositories, Domain Events |
| Martin Fowler | *Patterns of Enterprise Application Architecture*, *Monolith First* | Modular Monolith, Service Boundaries, Strangler Fig pattern |

### 3.4 Why Not Microservices From Day One

This must be explicitly addressed in the **Architecture** and **Migration Guide** documents. Key points:
- Operational overhead of microservices before product-market fit
- Distributed tracing, service mesh, inter-service auth all add engineering cost
- Modular monolith gives the same code-level discipline with simpler ops
- The strangler fig pattern allows incremental extraction when scale demands it

### 3.5 If Extracted into Microservice

- The documentation must include and explain if the Microservice extraction takes place you must identify the services from the current services that it will be extracted to
- List down all the services that will be created
- Explain each service and it's Responsibility

one example of it is given below, strictly for reference
```
The Microservices — List of Services
Given the modular monolith architecture (with microservice-ready boundaries), here are the logical services:
#Service NameResponsibility1API GatewayEntry point, JWT validation, tenant context extraction, rate limiting, routing2Auth ServiceUser registration/login, JWT issuance + refresh, RBAC enforcement, session management3Tenant ServiceTenant onboarding, settings, feature flags, plan management4Workflow Definition ServiceCRUD for workflow definitions, states, transitions, rules; versioning; publishing5Workflow Execution ServiceCreate instances, execute transitions, call Rule Engine, manage instance state, optimistic locking6Rule Engine ServiceStateless evaluator — receives (rule AST + context), returns (allow/deny + reason). Can be extracted as a pure function library or a dedicated service7Audit ServicePersists immutable audit log entries; exposes read API for history queries8Notification ServiceListens to transition events, sends emails/webhooks; handles retries and DLQ
```

### 3.5 Expected Directory Structure

The documentation must include and explain this structure:

```
src/
 ├── modules/
 │   ├── audit/
 │   ├── auth/
 │   ├── tenant/
 │   ├── workflow-definition/
 │   ├── workflow-execution/        (or equivalent)
 │   ├── database/
 │   │   └── migrations/
 │   └── [other modules]/
 ├── common/
 │   ├── contracts/                 (inter-module interfaces)
 │   ├── decorators/
 │   ├── guards/
 │   └── [other shared utilities]/
 └── main.ts
```

> Replace the above with the **actual directory tree** from the uploaded codebase.

### 3.6 Non-Functional Requirements & SLAs (strictly this must be included in the documentation)
```
16. Non-Functional Requirements + SLAs
16.1 Consistency

Type: Strong consistency for state transitions (you cannot be in two states at once)
Mechanism: PostgreSQL ACID transactions + optimistic locking (version column on instances)
Concurrent transition protection: If two users try to transition the same instance simultaneously, only the first succeeds; second gets a 409 Conflict response
SLA: Zero tolerance for split-brain state — every transition must be atomic (update instance + write audit in one transaction)

16.2 High Availability

Target SLA: 99.95% uptime (~4.4 hours downtime/year)
Strategy:

Stateless NestJS services (no local state) → can restart/replace without data loss
PostgreSQL Multi-AZ deployment (primary + standby in different AZs)
Redis Cluster with replication
Load Balancer across 2+ service instances
Health checks + auto-restart (Kubernetes liveness probes)


Deploy across: Minimum 2 Availability Zones

16.3 Scalability

Horizontal scaling: All NestJS services are stateless → spin up more instances under load
Database scaling: Read replicas for query load; write scaling via PgBouncer connection pooling
Tenant-level scaling: Large enterprise tenants can be isolated to dedicated instances (tenant sharding)
Target: Support 10,000 concurrent users, 1,000 tenants, 10M+ workflow instances

16.4 Latency
OperationTarget P99 LatencyLoad instance list< 200msExecute transition (including rule eval)< 500msLoad audit history< 300msLoad workflow definition (from cache)< 50msLoad workflow definition (from DB)< 200ms
16.5 Durability

Target: 99.999% durability for all data (especially audit logs)
Strategy:

PostgreSQL WAL (Write-Ahead Logging) — every write is logged before commit
S3-compatible backup for daily snapshots
Audit logs are written synchronously (no fire-and-forget) — a transition isn't "done" until the audit log is persisted
No soft deletes on audit logs — hard immutability



16.6 Fault Tolerance

Strategy:

Circuit Breaker on all external calls (notification service, webhook delivery)
If the notification service is down, the transition still succeeds — notifications are decoupled via message queue
Dead Letter Queue (DLQ) for failed event processing
Retry with exponential backoff for transient failures



16.7 Resilience

Graceful degradation: If Redis cache is unavailable, fall back to DB (slower but functional)
Bulkhead pattern: Tenant A's heavy load doesn't starve tenant B's requests — rate limiting per tenant at API Gateway
Chaos engineering readiness: Services should handle partial failures without full system collapse

16.8 Reliability

Target MTBF (Mean Time Between Failures): > 720 hours (30 days)
Target MTTR (Mean Time To Recovery): < 15 minutes
Approach: Immutable infrastructure (containers), blue-green deployments, automated rollback on error rate spike

16.9 Disaster Recovery
ScenarioRTO (Recovery Time Obj.)RPO (Recovery Point Obj.)Single service crash< 1 minute (Kubernetes auto-restart)0 data lossDatabase primary failure< 5 minutes (Multi-AZ failover)< 30 seconds (WAL replication lag)Full AZ outage< 15 minutes< 1 minuteFull region outage< 4 hours (cross-region restore)< 15 minutes

Backup strategy: Continuous WAL archiving to S3, daily snapshots, point-in-time recovery enabled

16.10 Read/Write Ratio

Approximately 80% reads / 20% writes under normal operations
Peak (business hours) transitions: Up to 40% writes during morning approval rushes
Implication: Route reads to replicas, protect write primary

16.11 Deployment

Containerization: Docker for all services
Orchestration: Kubernetes (EKS on AWS) or Docker Compose for smaller deployments
CI/CD: GitHub Actions → build → test → Docker image push → Helm chart deploy to k8s
Environments: dev → staging → production (with proper tenant data isolation)
Secrets management: AWS Secrets Manager / HashiCorp Vault (never .env files in production)
Compliance considerations:

GDPR: Tenant data deletion must cascade (right to erasure), data residency controls
SOC2: Audit logs must be tamper-proof, access logs retained for 1 year
HIPAA (if healthcare tenant): Encryption at rest (AES-256), in-transit (TLS 1.3), BAA required
```

ALSO REFER TO THIS AS WELL

```
Non-Functional Requirements (Quantitative targets)

Below are sane “enterprise SaaS” starting SLAs (tunable by tier):

Consistency

Workflow state transitions: strong consistency (no double-approve)

Notifications/webhooks: eventual consistency (async)

High Availability

Core API + execution: 99.95% (≈ 22 min/month)

Enterprise tier: 99.99% (≈ 4.4 min/month)

Latency (p95)

Read instance state: < 150ms

Transition request accepted: < 250ms

End-to-end with external connectors: depends on external SLA; treat as async

Durability

Definitions/instances/audit: 11 9s durability target via managed storage + backups

Fault tolerance

At-least-once event delivery

Idempotent transition processing (safe retries)

Resilience

Backpressure + queues for connectors

Circuit breakers around external calls

Disaster Recovery

RPO: 5–15 minutes (tier-based)

RTO: 30–60 minutes (tier-based)

Deployment model

Start single-region multi-AZ

Move to multi-region active-active for enterprise later

Observability

100% transitions produce structured logs + traces

Per-tenant metrics + SLO dashboards

Compliance controls

SOC2: access controls, audit trails, change mgmt, logging

GDPR: data minimization, deletion policies, tenant export, encryption

HIPAA/PCI: isolated tiers, strict access, key mgmt, retention policies, BAA/attestation where needed
```

by comparing the 2 SLA's, mixing them, write the final NFA and SLAs and after this include a summary table for all the SLA's and Non Functional Requirements

one example table is given below, strictly for reference
```
| NFR               |                                            Suggested SLA/SLO | Notes                                                       |
| ----------------- | -----------------------------------------------------------: | ----------------------------------------------------------- |
| Consistency       | **Strong** for state transitions (linearizable per instance) | Prevent double-transition; authoritative server-side rules  |
| High Availability |                                       **99.9%** monthly (v1) | 43m downtime/month                                          |
| Scalability       |                                 10x tenants without redesign | Horizontal scale API; DB read replicas                      |
| Latency (p95)     |                    Reads: **<150ms**, Transition: **<300ms** | Transition includes rule eval + TX                          |
| Durability        |         **11 9s** data durability (via managed DB + backups) | RDS-style guarantees                                        |
| Fault Tolerance   |                       No single point of failure in API tier | Multi-AZ + stateless services                               |
| Resilience        |                Graceful degradation on optional integrations | Webhooks async; retries                                     |
| Reliability       |                    Error rate < **0.1%** for transition APIs | SLO-driven                                                  |
| Disaster Recovery |                            RPO **≤ 5 min**, RTO **≤ 60 min** | Depends on budget/region                                    |
| Read/Write Ratio  |            Often **read 3 : write 1**, but audit can flip it | Depends on tenant behavior                                  |
| Deployment        |                            Zero-downtime deploy for API tier | Blue/green or rolling; DB migrations gated                  |

```


## 4. Technology Stack (Fixed Context)

All technology decisions below must be **justified** in their respective documents. See Section 7 for the specific questions that must be answered.

### 4.1 Backend Stack

| Layer | Technology | Version (from package.json) |
|-------|-----------|------------------------------|
| Runtime | Node.js | — |
| Package Manager / Runtime | Bun | — |
| Framework | NestJS | — |
| Language | TypeScript | — |
| ORM | TypeORM | — |
| Database | PostgreSQL | — |
| Cache | Redis | — |
| Messaging | NATS | — |
| Auth | JWT + Argon2 | — |
| Rule Engine | json-rules-engine | — |
| Containerization | Docker | — |

> Fill in versions from the actual `package.json` files.

### 4.2 Frontend Stack

| Layer | Technology | Version (from package.json) |
|-------|-----------|------------------------------|
| Framework | React + Vite | — |
| Language | TypeScript | — |
| Styling | TailwindCSS | — |
| UI Components | shadcn/ui | — |
| State Management | Zustand | — |
| Server State | TanStack Query | — |

> Fill in versions from the actual frontend `package.json`.

### 4.3 Infrastructure / DevOps

| Concern | Tool |
|---------|------|
| Version Control | GitHub |
| Containerization | Docker / Docker Compose |
| Deployment | [Fill from docker-compose / Dockerfile] |

---


## 5. Documents to Generate

Generate each document as a **separate Markdown file** with the filename specified below.

| # | Document | Output Filename | Primary Source Files |
|---|----------|----------------|---------------------|
| 1 | System Architecture Design | `01-SYSTEM-ARCHITECTURE.md` | All + AGENT_PROMPT + WORKFLOW_EXECUTION |
| 2 | High Level Design | `02-HIGH-LEVEL-DESIGN.md` | USER_API_FLOW + WORKFLOW_EXECUTION + codebase |
| 3 | Low Level Design | `03-LOW-LEVEL-DESIGN.md` | AGENT_PROMPT + SCHEMA_DESIGN_PHILOSOPHY + codebase |
| 4 | Domain Model / DDD Design | `04-DOMAIN-MODEL-DDD.md` | SCHEMA_DESIGN_PHILOSOPHY + codebase |
| 5 | Database Design | `05-DATABASE-DESIGN.md` | SCHEMA_DESIGN_PHILOSOPHY + RLS + migrations |
| 6 | API Design | `06-API-DESIGN.md` | OPEN_API_SPEC.json (source of truth) + USER_API_FLOW |
| 7 | Security Design | `07-SECURITY-DESIGN.md` | RLS + TENANT_RATE_LIMITING + AGENT_PROMPT |
| 8 | Scalability & Performance | `08-SCALABILITY-PERFORMANCE.md` | TENANT_RATE_LIMITING + architecture |
| 9 | Product Requirements (PRD) | `09-PRD.md` | USER_API_FLOW + OPEN_API_SPEC (API/Integration only) |
| 10 | Migration Guide | `10-MIGRATION-GUIDE.md` | Architecture + all modules |
| 11 | FAQ.md | `11-FAQ.md` | Answers to the Section 7 questions |

> After doing all these, generate 2 README.md files for respective backend and frontend codebase

---


## 6. Content Requirements Per Document

### 6.1 `01-SYSTEM-ARCHITECTURE.md` — System Architecture Design

**Purpose:** Explain why the system is built the way it is. Justify every major decision.

#### Required Sections

```
# System Architecture Design Decisions & Philosophies

## Table of Contents          ← required, down to ### level

## 1. System Overview
   ### 1.1 Purpose of the System
   ### 1.2 Core Capabilities
   ### 1.3 Intended Users & Tenants

## 2. Architectural Style
   ### 2.1 Microservice-Extractable Contract-First Modular Monolith
   ### 2.2 Why Not Microservices From Day One?
   ### 2.3 Why Not a Traditional Monolith?
   ### 2.4 Theoretical Foundations (Evans + Fowler)

## 3. Major Components & Modules
   ### 3.1 Module Catalogue (table with module name, responsibility, bounded context)
   ### 3.2 Full Directory Structure (actual from codebase)
   ### 3.3 Module Boundary Rules

## 4. Data Flow
   ### 4.1 Request Lifecycle (HTTP request → response)
   ### 4.2 Workflow Execution Data Flow
   ### 4.3 Inter-Module Communication (contracts)
   ### 4.4 Event Flow (if domain events / NATS used)

## 5. Technology Stack
   ### 5.1 Backend Stack (table with justifications)
   ### 5.2 Frontend Stack (table with justifications)
   ### 5.3 Infrastructure Stack
   → Answer all 19 technology questions from Section 7

## 6. Deployment Architecture
   ### 6.1 Containerization Strategy (Docker)
   ### 6.2 Service Topology (from docker-compose)
   ### 6.3 Environment Configuration (.env catalogue)
   ### 6.4 Future Microservice Extraction Path

## 7. Key Design Decisions & Rationale
   (One subsection per major decision with: Decision → Alternatives Considered → Why Chosen)
```

---

### 6.2 `02-HIGH-LEVEL-DESIGN.md` — High Level Design

**Purpose:** Show how the system is structured and how major flows work end-to-end.

#### Required Sections

```
# High Level Design

## Table of Contents

## 1. Overview

## 2. Major Components & Modules
   ### 2.1 Component Responsibilities (table)
   ### 2.2 API Boundaries
   ### 2.3 External Integrations

## 3. Component Interactions
   ### 3.1 Module Dependency Rules
   ### 3.2 Contract-Based Communication
   ### 3.3 Shared Kernel / Common Layer

## 4. Major System Flows
   ### 4.1 User Registration & Authentication Flow
   ### 4.2 Tenant Onboarding Flow
   ### 4.3 Workflow Definition Creation Flow
   ### 4.4 Workflow Execution Flow (trigger → completion)
   ### 4.5 Rule Evaluation Flow
   ### 4.6 Audit Trail Flow
   (Each flow: numbered steps in prose + table summarizing actors, modules, data)

## 5. Data Flow Across Layers
   ### 5.1 HTTP Layer → Application Layer → Domain Layer → Persistence Layer
   ### 5.2 Tenant Context Propagation

## 6. Frontend Architecture
   ### 6.1 Frontend Module Structure
   ### 6.2 State Management Strategy (Zustand + TanStack Query)
   ### 6.3 API Integration Pattern
```


---

### 6.3 `03-LOW-LEVEL-DESIGN.md` — Low Level Design

**Purpose:** Detailed internal design — classes, patterns, data structures, algorithms.

#### Required Sections

```
# Low Level Design

## Table of Contents

## 1. Overview

## 2. Backend Module Deep Dives
   (For EACH module — one subsection per module):
   ### [ModuleName] Module
   #### Responsibility
   #### Key Classes / Services (with file paths)
   #### Contracts Exposed
   #### Contracts Consumed
   #### Internal Data Flow
   #### Key Algorithms or Business Logic

## 3. Design Patterns Catalogue
   | Pattern | Where Used | File Path | Why |
   (Cover: Repository, Aggregate Root, Factory, Strategy, Observer, Decorator, Guard, etc.)

## 4. Common / Shared Layer
   ### 4.1 Decorators
   ### 4.2 Guards
   ### 4.3 Pipes / Interceptors
   ### 4.4 Contracts / Interfaces

## 5. Workflow Execution Engine — Deep Dive
   ### 5.1 State Machine Design
   ### 5.2 Rule Evaluation (json-rules-engine integration)
   ### 5.3 Immutable Snapshot Strategy
   ### 5.4 Execution Context Design

## 6. Database Schema (detailed)
   → Cross-reference with 05-DATABASE-DESIGN.md, but include here:
   ### 6.1 TypeORM Entity Class Catalogue (table: entity, file path, table name)
   ### 6.2 Key Entity Relationships

## 7. Error Handling Strategy
   ### 7.1 Exception Hierarchy
   ### 7.2 Global Exception Filter
   ### 7.3 Domain Error vs HTTP Error mapping

## 8. Frontend Low Level Design
   ### 8.1 Component Architecture
   ### 8.2 Hook Patterns
   ### 8.3 API Client Design (TanStack Query setup)
   ### 8.4 Zustand Store Design

## 9. Dependencies & Versions
   (Full table from both package.json files)
```


---

### 6.4 `04-DOMAIN-MODEL-DDD.md` — Domain Model / DDD Design

**Purpose:** Capture the domain using DDD building blocks.

#### Required Sections

```
# Domain Model / DDD Design

## Table of Contents

## 1. Overview & DDD Primer (brief)

## 2. Bounded Contexts
   | Context | Module(s) | Core Responsibility |
   ### 2.1 Context Map (describe relationships: Shared Kernel, ACL, Partnership, etc.)

## 3. Aggregates
   (For each aggregate):
   ### [AggregateName] Aggregate
   #### Aggregate Root
   #### Entities Within
   #### Value Objects Within
   #### Invariants Enforced
   #### Repository Interface

## 4. Entities (non-root)
   | Entity | Belongs To Aggregate | Key Attributes | Identity |

## 5. Value Objects
   | Value Object | Aggregate | Properties | Immutable? |

## 6. Domain Events
   | Event Name | Raised By | Consumed By | Payload |

## 7. Repositories
   | Repository | Aggregate | Interface Location | Implementation |

## 8. Domain Services
   | Service | Responsibility | Operates Across |

## 9. Application Services
   | Service | Module | Orchestrates |

## 10. Factories
   | Factory | Creates | Location |

## 11. Ubiquitous Language Glossary
   | Term | Definition | Context |
```

---

### 6.5 `05-DATABASE-DESIGN.md` — Database Design

**Purpose:** Complete database design including schema, indexes, RLS, and operational concerns.

#### Required Sections

```
# Database Design Documentation

## Table of Contents

## 1. Overview
   ### 1.1 Database Technology Choice (PostgreSQL — justify)
   ### 1.2 Schema Design Philosophy (from SCHEMA_DESIGN_PHILOSOPHY.md — include content)
   ### 1.3 Multi-Tenancy Strategy

## 2. Table Catalogue
   (For EACH table — sourced from migrations + entity files):
   ### [table_name]
   | Column | Type | Nullable | Default | Description |
   #### Indexes
   #### Constraints
   #### Foreign Keys
   #### RLS Policies (if applicable)

## 3. Entity Relationship Overview
   ### 3.1 Core Entity Groups
   ### 3.2 Cross-Context Relationships

## 4. Row-Level Security (RLS)
   ### 4.1 RLS Strategy Overview (from RLS_IMPLEMENTATION_STRATEGY.md — include content)
   ### 4.2 Tenant Isolation via RLS
   ### 4.3 RLS Policy Catalogue (table: policy name, table, rule, effect)
   ### 4.4 RLS Testing Strategy

## 5. Migration Strategy
   ### 5.1 Migration Tool & Convention
   ### 5.2 Migration File Catalogue (table: filename, date, description, tables affected)
   ### 5.3 Zero-Downtime Migration Patterns Used

## 6. Indexing Strategy
   ### 6.1 Index Catalogue (table: index name, table, columns, type, purpose)
   ### 6.2 Indexing Decision Framework

## 7. Concurrency Control
   ### 7.1 Optimistic vs Pessimistic Locking decisions
   ### 7.2 Version columns / timestamps

## 8. Data Retention & Soft Delete Strategy

## 9. Backup & Recovery Strategy (conceptual)

## 10. Performance Tuning Notes
   ### 10.1 Query Optimization Patterns
   ### 10.2 Connection Pooling
```

---

### 6.6 `06-API-DESIGN.md` — API Design

**Purpose:** Full API reference, auth model, and design decisions.

> ⚠️ `OPEN_API_SPEC.json` is the **source of truth**. Include the full specification verbatim in an appendix.

#### Required Sections

```
# API Design Documentation

## Table of Contents

## 1. Overview
   ### 1.1 API Style (REST)
   ### 1.2 Base URL & Versioning Strategy
   ### 1.3 Authentication Model (JWT)
   ### 1.4 Tenant Context in API

## 2. Authentication & Authorization
   ### 2.1 JWT Structure (claims, expiry)
   ### 2.2 Refresh Token Strategy
   ### 2.3 API Key Authentication (if applicable)
   ### 2.4 Role-Based Access Control (RBAC) Model

## 3. Endpoint Catalogue
   (Grouped by resource/module — sourced from OPEN_API_SPEC.json):
   For each group:
   ### [Resource Group] Endpoints
   | Method | Path | Auth Required | Role | Description |
   #### Detailed endpoint entries with request/response schemas

## 4. Request/Response Conventions
   ### 4.1 Standard Response Envelope (if used)
   ### 4.2 Pagination Convention
   ### 4.3 Filtering & Sorting Convention
   ### 4.4 Date/Time Format
   ### 4.5 ID Format (UUID vs integer)

## 5. Error Handling
   ### 5.1 Error Response Schema
   ### 5.2 HTTP Status Code Usage Table
   ### 5.3 Domain Error Code Catalogue

## 6. Rate Limiting
   ### 6.1 Rate Limit Headers
   ### 6.2 Per-Tenant Limits
   ### 6.3 Rate Limit Exceeded Response

## 7. Versioning Strategy
   ### 7.1 Current Version
   ### 7.2 Deprecation Policy

## 8. Webhooks (if applicable)
   ### 8.1 Webhook Event Catalogue
   ### 8.2 Payload Schema
   ### 8.3 Retry Strategy

## Appendix A: Full OpenAPI Specification
   (Embed complete OPEN_API_SPEC.json as a code block) YOU MAY SKIP THIS PART ONLY, I CAN DO IT LATER TO PRESERVE YOUR CONTEXT RESPONSE
```


### 6.7 `07-SECURITY-DESIGN.md` — Security Design

**Purpose:** Comprehensive security architecture for a multi-tenant SaaS system.

#### Required Sections

```
# Security Design Documentation

## Table of Contents

## 1. Security Overview & Threat Model
   ### 1.1 Assets to Protect
   ### 1.2 Threat Actors
   ### 1.3 Key Threat Scenarios

## 2. Authentication
   ### 2.1 JWT Design (from AGENT_PROMPT.md)
   ### 2.2 Argon2 Password Hashing — Why Not Bcrypt?
   ### 2.3 Token Lifecycle (issuance, refresh, revocation)
   ### 2.4 Session Management

## 3. Authorization
   ### 3.1 RBAC Model (roles, permissions table)
   ### 3.2 NestJS Guards Implementation
   ### 3.3 Decorator-Based Access Control

## 4. Tenant Isolation
   ### 4.1 Multi-Tenancy Architecture
   ### 4.2 Row-Level Security (PostgreSQL RLS) — full content from RLS_IMPLEMENTATION_STRATEGY.md
   ### 4.3 Tenant Context Propagation
   ### 4.4 Cross-Tenant Attack Prevention

## 5. Rate Limiting & Abuse Prevention
   ### 5.1 Per-Tenant Rate Limiting — full content from TENANT_RATE_LIMITING.md
   ### 5.2 IP-Based Rate Limiting
   ### 5.3 DDoS Considerations

## 6. Input Validation & Sanitization
   ### 6.1 DTO Validation (class-validator)
   ### 6.2 SQL Injection Prevention (TypeORM parameterization)
   ### 6.3 XSS Prevention
   ### 6.4 CSRF Protection

## 7. Data Security
   ### 7.1 Encryption at Rest
   ### 7.2 Encryption in Transit (TLS)
   ### 7.3 Sensitive Field Handling
   ### 7.4 PII Considerations

## 8. Secret Management
   ### 8.1 Environment Variable Strategy
   ### 8.2 Secret Rotation Policy (conceptual)

## 9. Audit & Monitoring
   ### 9.1 Audit Module Design
   ### 9.2 Audit Event Catalogue (table: event, actor, data captured)
   ### 9.3 Security Monitoring Strategy

## 10. Security Headers & HTTP Hardening

## 11. Dependency Security
```

---

### 6.8 `08-SCALABILITY-PERFORMANCE.md` — Scalability & Performance

#### Required Sections

```
# Scalability & Performance Design Documentation

## Table of Contents

## 1. Overview
   ### 1.1 Performance Targets (define SLOs/SLAs if known, else note as TBD)
   ### 1.2 Scalability Goals

## 2. Horizontal Scaling
   ### 2.1 Stateless Application Design
   ### 2.2 Session Handling in Clustered Environment
   ### 2.3 NATS for Distributed Messaging

## 3. Vertical Scaling
   ### 3.1 Node.js Event Loop Optimization
   ### 3.2 Memory & CPU Considerations

## 4. Caching Strategy
   ### 4.1 Redis Cache Design
   ### 4.2 Cache Invalidation Strategy
   ### 4.3 What Is Cached (catalogue: key pattern, TTL, purpose)

## 5. Database Performance
   ### 5.1 Connection Pooling
   ### 5.2 Query Optimization Patterns
   ### 5.3 Index Design for Performance
   ### 5.4 Read Replica Strategy (future)

## 6. Messaging & Async Processing
   ### 6.1 NATS Integration
   ### 6.2 Why NATS Over Kafka (explain Kafka as overkill in detail)
   ### 6.3 Async Workflow Execution
   ### 6.4 Queue Depth & Backpressure

## 7. Load Handling
   ### 7.1 Rate Limiting (from TENANT_RATE_LIMITING.md)
   ### 7.2 Graceful Degradation
   ### 7.3 Circuit Breaker Pattern (if used)

## 8. Frontend Performance
   ### 8.1 Vite Build Optimization
   ### 8.2 TanStack Query Caching
   ### 8.3 Code Splitting
   ### 8.4 CDN Strategy

## 9. Future Microservice Extraction & Scaling
   ### 9.1 Module Extraction Order (priority)
   ### 9.2 Service Mesh Considerations
   ### 9.3 Event Sourcing Consideration (if relevant)
```


---

### 6.9 `09-PRD.md` — Product Requirements Document

**Purpose:** Functional and non-functional requirements for the API and integration layer.  
> ⚠️ **Strictly limited to frontend ↔ backend API interactions and integrations.** No infrastructure, no ops.

#### Required Sections

```
# Product Requirements Document (PRD)

## Table of Contents

## 1. Product Overview
   ### 1.1 Problem Statement
   ### 1.2 Target Users
   ### 1.3 Core Value Proposition

## 2. Functional Requirements
   (Grouped by domain/module — sourced from USER_API_FLOW.md):
   ### 2.1 Authentication & User Management
   ### 2.2 Tenant Management
   ### 2.3 Workflow Definition Management
   ### 2.4 Workflow Execution
   ### 2.5 Rule Management
   ### 2.6 Audit & Reporting
   ### [other modules as applicable]

   For each feature area:
   #### Feature: [Name]
   | User Story | Acceptance Criteria | Priority | API Endpoint(s) |

## 3. Non-Functional Requirements
   ### 3.1 Performance Requirements
   | Requirement | Target | Measurement |
   ### 3.2 Security Requirements (API-layer only)
   ### 3.3 Reliability Requirements
   ### 3.4 Scalability Requirements (API-layer targets)

## 4. Integration Requirements
   ### 4.1 Frontend ↔ Backend Integration Contract
   ### 4.2 Authentication Flow (end-to-end)
   ### 4.3 Error Handling Contract
   ### 4.4 Real-Time / WebSocket Requirements (if any)
   ### 4.5 File Upload / Download Requirements (if any)

## 5. Constraints
   ### 5.1 Technical Constraints
   ### 5.2 Business Constraints
   ### 5.3 Compliance Constraints

## 6. Out of Scope
   (Explicitly state what is NOT covered)
```


---

### 6.10 `10-MIGRATION-GUIDE.md` — Migration Guide

**Purpose:** How to migrate from the current Modular Monolith to Microservices.

#### Required Sections

```
# Migration Guide: Modular Monolith → Microservices

## Table of Contents

## 1. Overview
   ### 1.1 Why Migrate? (triggers and signals)
   ### 1.2 Migration Strategy: Strangler Fig Pattern
   ### 1.3 Migration Principles

## 2. Prerequisites
   ### 2.1 Team & Skills Required
   ### 2.2 Infrastructure Prerequisites
   ### 2.3 Observability Prerequisites (tracing, logging)
   ### 2.4 Contract Stability Check

## 3. Migration Phases

   ### Phase 1: Preparation (In-Monolith)
   #### 3.1.1 Audit module boundaries (contract checklist)
   #### 3.1.2 Identify data ownership per module
   #### 3.1.3 Replace direct DB joins across modules with API calls (within monolith)
   #### 3.1.4 Instrument with distributed tracing (OpenTelemetry)
   ✦ Example: Auditing the `audit` module boundary

   ### Phase 2: Extract First Microservice
   #### 3.2.1 Choose extraction candidate (lowest coupling, clearest boundary)
   #### 3.2.2 Create independent service (NestJS app)
   #### 3.2.3 Database extraction (schema separation)
   #### 3.2.4 Dual-write period
   #### 3.2.5 Traffic cut-over
   ✦ Example: Extracting the `tenant` module as a microservice

   ### Phase 3: NATS-Based Event Migration
   #### 3.3.1 Replacing in-process events with NATS
   #### 3.3.2 Event schema contracts
   ✦ Example: Migrating WorkflowExecutionCompleted event

   ### Phase 4: API Gateway Introduction
   #### 3.4.1 Gateway selection and setup
   #### 3.4.2 Routing rules
   #### 3.4.3 Auth delegation

   ### Phase 5: Full Service Mesh
   #### 3.5.1 Service discovery
   #### 3.5.2 mTLS between services

## 4. Module Extraction Priority Order
   | Priority | Module | Reason | Dependencies |

## 5. Data Migration Considerations
   ### 5.1 Schema per Service vs Shared Database (transition)
   ### 5.2 Data consistency during cut-over
   ### 5.3 Rollback strategy

## 6. Troubleshooting
   | Problem | Likely Cause | Resolution |

## 7. Post-Migration Checklist
   - [ ] All modules have independent CI/CD
   - [ ] No shared database tables across services
   - [ ] Distributed tracing operational
   - [ ] API gateway health checks passing
   - [ ] Contract tests green
   - [ ] Runbooks written per service
```



## 7. Mandatory Questions to Answer

Every one of the following questions **must be answered** in the appropriate document. Mark the answer location clearly with the document name and section.

| # | Question | Primary Document | Section |
|---|----------|-----------------|---------|
| 1 | Why Node.js over Golang or Java for this backend? | 01-ARCHITECTURE | §5 Tech Stack |
| 2 | Why Bun over npm/yarn as package manager and runtime? | 01-ARCHITECTURE | §5 Tech Stack |
| 3 | Why NestJS over Express or Fastify? | 01-ARCHITECTURE | §5 Tech Stack |
| 4 | Why TypeORM over Prisma or Sequelize? | 01-ARCHITECTURE | §5 Tech Stack |
| 5 | Why PostgreSQL over MySQL or MongoDB? | 05-DATABASE | §1 Overview |
| 6 | Why Redis over Memcached or other NoSQL caches? | 08-SCALABILITY | §4 Caching |
| 7 | Why NATS over RabbitMQ or Kafka? (**Must explain why Kafka is overkill in detail**) | 08-SCALABILITY | §6 Messaging |
| 8 | Why JWT over OAuth/SAML for authentication? | 07-SECURITY | §2 Auth |
| 9 | Why Argon2 over Bcrypt or Scrypt? | 07-SECURITY | §2 Auth |
| 10 | What is a Microservice-Extractable Contract-First Modular Monolith and why was it chosen? Why not microservices from day one? | 01-ARCHITECTURE | §2 Style |
| 11 | Explain the security model in full detail | 07-SECURITY | All sections |
| 12 | Explain the scalability model in full detail | 08-SCALABILITY | All sections |
| 13 | Why Docker over Podman or LXC? | 01-ARCHITECTURE | §6 Deployment |
| 14 | Why GitHub over GitLab or Bitbucket? | 01-ARCHITECTURE | §6 Deployment |
| 15 | Why React + Vite over Angular or Vue? | 01-ARCHITECTURE | §5 Tech Stack |
| 16 | Why TailwindCSS over Bootstrap or Materialize? | 01-ARCHITECTURE | §5 Tech Stack |
| 17 | Why TanStack Query + Zustand over Redux or MobX? | 01-ARCHITECTURE | §5 Tech Stack |
| 18 | Why shadcn/ui over Ant Design or Material-UI? | 01-ARCHITECTURE | §5 Tech Stack |
| 19 | Why json-rules-engine over Drools, JBoss Rules, or a custom AST-based engine? | 03-LLD | §5 Workflow Engine |
| 20 | Why REST, Why not GraphQL, gRPC? | 06-API-DESIGN | §1 Overview |
| 21 | When shifted to Microservices, What should be the internal communication protocol? Will NATS fit here or Kafka will be reqired? | 10-MIGRATION-GUIDE.md | -- |
| 22 | When shifted to Microservices, Will API Gateway be needed, which API Gateway will serve better, Kong or Apigee or Amazon Api Gateway or Custom Gateway like Fastify? Justify | 10-MIGRATION-GUIDE.md | -- |
| 23 | When shifted to Microservices, which load balancer will be better, NGINX or HAProxy or AWS ALB? | 10-MIGRATION-GUIDE.md | -- |
| 24 | When shifted to Microservices, Which Observability tool will be better, Choose from Prometheus, Grafana, Cloudwatch, Sentry, Datadog, New Relic, ELK Stack, X-Ray. Justify | 10-MIGRATION-GUIDE.md | -- |
| 25 | When shifted to Microservices, What should be the deployment strategy, Will CI/CD pipelines change, will Blue-Green or A/B testing be required? | 10-MIGRATION-GUIDE.md | -- |
| 26 | When shifted to Microservices, How will the team deal with the increase in Complexity, What strategies will be used to manage the complexity, | 10-MIGRATION-GUIDE.md | -- |
| 27 | When shifted to Microservices, How will the team ensure the system remains performant, what strategies will be used to monitor and improve performance | 10-MIGRATION-GUIDE.md | -- |
| 28 | When shifted to Microservices, How will the team ensure the system remains resilient, what strategies will be used to handle failures and ensure high availability | 10-MIGRATION-GUIDE.md | -- |
| 29 | When shifted to Microservices, How will the team ensure the system remains secure, what strategies will be used to handle security | 10-MIGRATION-GUIDE.md | -- |
| 30 | When shifted to Microservices, How will the team ensure the system remains reliable and Highly Available, what strategies will be used to handle outages and ensure quick recovery | -- | -- |
| 31 | When shifted to Microservices, How will the team ensure the system remains scalable, what strategies will be used to handle increased load and ensure quick response times | 10-MIGRATION-GUIDE.md | -- |
| 32 | When shifted to Microservices, How will the team ensure the system remains maintainable, what strategies will be used to handle changes and ensure quick deployment | 10-MIGRATION-GUIDE.md | -- |
| 33 | When shifted to Microservices, How will the team ensure the system remains observable, what strategies will be used to handle monitoring and ensure quick debugging | 10-MIGRATION-GUIDE.md | -- |
| 34 | When shifted to Microservices, How will the team ensure the system remains testable, what strategies will be used to handle testing and ensure quick fixes | 10-MIGRATION-GUIDE.md | -- |
| 35 | When shifted to Microservices, How will the team ensure the system remains governable, what strategies will be used to handle compliance and ensure quick audits | 10-MIGRATION-GUIDE.md | -- |
| 36 | When shifted to Microservices, How will the team ensure the system remains Extensible, what strategies will be used to handle changes and ensure quick deployment | 10-MIGRATION-GUIDE.md | -- |


## THIS MUST BE DONE
> Also Export answers to these questions to a separate FAQ.md file

---



## 8. Global Writing Rules

Apply these rules to **every document** without exception.

### 8.1 Style & Clarity

- Write for a **mid-level engineer joining the team** — no assumed prior knowledge of this codebase
- Every design decision must follow this pattern: **Decision → Alternatives Considered → Why This Was Chosen → Trade-offs**
- Use **active voice** and **present tense** throughout
- No vague statements like *"this is efficient"* — always quantify or explain specifically why

### 8.2 Formatting Rules

- Every document must open with: title, one-paragraph summary, and full Table of Contents (to `###` level minimum)
- **Use tables** for: catalogues, comparisons, mappings, decision matrices, API endpoints
- **Use code blocks** for: file paths, class names, SQL, JSON, TypeScript examples
- Do not use bullet lists for content that belongs in tables
- Reference actual file paths from the codebase using backtick notation: `` `src/modules/auth/auth.service.ts` ``

### 8.3 Content Completeness Rules

- If a reference document (e.g., `SCHEMA_DESIGN_PHILOSOPHY.md`) has content highly relevant to a section, **include that content directly** — do not just link to it
- Do not write "see diagram" unless a diagram is actually included in the same document
- Every module mentioned must have its directory path noted
- Every technology decision must reference at least one concrete alternative that was NOT chosen

### 8.4 What NOT to Include

- Do not include infrastructure-level ops concerns (monitoring setup, CI/CD pipelines) in the PRD
- Do not duplicate the OpenAPI spec inline except in Appendix A of the API Design document
- Do not include frontend design in the Security or Database documents unless directly relevant
- Diagrams are explicitly excluded (noted as "TO BE ADDED" with a placeholder comment)

### 8.5 Placeholders for Diagrams

Wherever a diagram would normally appear, insert:

```markdown
> 📐 **[DIAGRAM PLACEHOLDER]**  
> *Type:* [Architecture Diagram / Sequence Diagram / ER Diagram / etc.]  
> *Description:* [What this diagram should show]  
> *To be created separately.*
```

---

## 9. Output Format & Delivery

### 9.1 File Delivery

- Generate each of the 13 documents as an **independent Markdown file**
- Filenames must match exactly as listed in Section 5
- Each file must be independently readable — do not rely on cross-file navigation
- All 11 files should be packaged for download




### 9.2 Document Header Template

Each document must begin with this header:

```markdown
---
title: [Document Title]
version: 1.0.0
status: Draft
project: [Project Name — fill from codebase]
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: [Date]
---
```


### 9.3 Cross-Reference Convention

When referencing another document, use:

```markdown
→ See [05-DATABASE-DESIGN.md §4.2 RLS] for full RLS policy catalogue
```


### 9.4 Completeness Checklist

Before delivering each document, verify:

- [ ] Table of Contents complete to `###` level
- [ ] All mandatory questions answered (where applicable per document)
- [ ] Actual file paths referenced (not placeholder paths)
- [ ] All tables populated (no empty rows unless data genuinely not available)
- [ ] Technology decisions include alternatives considered
- [ ] Diagram placeholders inserted where diagrams are needed
- [ ] Document header filled in
- [ ] No assumptions made without being explicitly marked as `[ASSUMPTION: ...]`

## 10. REMEMBER THESE POINTS

1. The documentation must be written in a way that a new engineer can understand the codebase and start contributing to it immediately.
2. The Reference files contains good amount of information, you can not just refer to them, you can include the contents into the respective section of the documentations that you will create wherever required
3. The documentation must be written in a way that is easy to understand and follow.
4. For Each document that you will write, do preserve the table of content for each atleast upto ### or heading3 level
5. You must use tables for content wherever possible
6. Each document must be a separate markdown file
7. The final output must be in Markdown format
8. You must take into account all the constraints and properties of the project that are mentioned in the prompt and in the reference files


---

## You need to include these sections in the documentation as well, somewhere relevant, wherever applicable, in a properly formatted manner

>> DO NOT CHANGE ANY TEXT FROM THESE SECTIONS, YOU FORMAT THEM PROPERLY AND INCLUDE THEM IN THE DOCUMENTATION AS IT IS, JUST INCLUDING THE CONTENT IS NOT ENOUGH, YOU MUST FORMAT IT PROPERLY AND INCLUDE IT IN THE DOCUMENTATION IN A WAY THAT IT MAKES SENSE WITH THE DOCUMENTATION

### Section 1: Microservice-Extractable Contract-First Modular Monolith

<!-- SECTION 1 BEGIN HERE -->

```
Cross-Module Data Access — The Right Patterns
First, Define the Problem Precisely
You have three distinct scenarios disguised as one question. Each needs a different solution.
ScenarioExampleWrong SolutionRight SolutionCurrent request user contextTenantService needs to know WHO is making this API callQuery users tableRead from JWT claimsSynchronous lookup of another entityTenantService needs details of a specific user by ID to process business logicImport UserRepository directlyExport a contract interface from AuthModuleData needed for complex queries / joins across modulesWorkflowExecution needs tenant plan limits + user roles togetherCross-module SQL joinEvent-driven shadow/read mode


Pattern 1 — JWT Claims (Zero DB Calls)
When to use it
When the data you need is about the currently authenticated user making the request. This covers 80% of apparent cross-module data needs.
How it works
The JWT token is issued by AuthModule at login time. It contains a payload. That payload travels with every request. Every module can read it without touching the database.
JWT Payload (set at login, read everywhere):
{
  sub: "user-uuid",
  email: "john@acme.com",
  tenantId: "tenant-uuid",
  roles: ["Admin"],
  firstName: "John",
  plan: "pro"         ← tenant plan embedded too
}
The @CurrentUser() decorator in libs/shared extracts this from request.user (populated by the JWT strategy). No DB call. No module import. No coupling.
TenantController:
  createSomething(@CurrentUser() user: JwtPayload) {
    // user.tenantId, user.roles, user.email — all available
    // No AuthModule import needed
  }
What lives in the JWT
Populate the JWT intelligently at login time. Include fields that are frequently needed across modules.
libs/shared/src/interfaces/jwt-payload.interface.ts

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
Rule of thumb: If it's about who is asking, use JWT. If it's about someone or something else, read on.


Pattern 2 — Exported Contract Interface (Synchronous Cross-Module Query)
When to use it
When Module B needs to look up a specific entity owned by Module A by ID, and it needs the result before it can continue processing. This is a true synchronous dependency.
The Wrong Way (that breaks microservice extraction)
typescript// ❌ WRONG — TenantService directly importing AuthModule's repository
import { UserRepository } from '../auth/repositories/user.repository';

@Injectable()
export class TenantService {
  constructor(private userRepo: UserRepository) {} // ← breaks everything on extraction
}
```

This creates a hard coupling at the repository layer. When you extract AuthModule to its own service, `UserRepository` no longer exists in the same process. Your code breaks.

### The Right Way — Export a Purpose-Built Query Service

AuthModule exposes a **deliberately limited interface** — only the methods other modules are allowed to call. Not the full repository. Not the full UserService. A contract surface.

**Step 1: Create the contract interface in `libs/shared`**
```
libs/shared/src/interfaces/
  ├── contracts/                       ← NEW folder
  │   ├── user-query.contract.ts       ← what AuthModule promises to expose
  │   ├── tenant-query.contract.ts     ← what TenantModule promises to expose
  │   └── workflow-query.contract.ts   ← what WorkflowDefinitionModule promises to expose
typescript// libs/shared/src/interfaces/contracts/user-query.contract.ts

export const USER_QUERY_CONTRACT = Symbol('USER_QUERY_CONTRACT');

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
```
apps/api/src/modules/auth/
  ├── services/
  │   ├── auth.service.ts
  │   ├── user.service.ts             ← internal full service
  │   └── user-query.service.ts       ← implements the contract, thin facade
typescript// apps/api/src/modules/auth/services/user-query.service.ts

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
Step 3: AuthModule exports ONLY this contract service
typescript// apps/api/src/modules/auth/auth.module.ts

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
```
apps/api/src/modules/workflow-execution/
  ├── entities/
  │   ├── workflow-instance.entity.ts
  │   └── user-shadow.entity.ts       ← local read model, NOT the source of truth
  ├── repositories/
  │   └── user-shadow.repository.ts
  ├── subscribers/
  │   └── auth-events.subscriber.ts   ← keeps shadow table in sync
typescript// apps/api/src/modules/workflow-execution/entities/user-shadow.entity.ts

@Entity('we_user_shadows')            // ← prefixed 'we_' = workflow-execution module
export class UserShadow {
  @PrimaryColumn('uuid')
  id: string;                         // same as users.id in AuthModule

  @Column()
  tenantId: string;

  @Column()
  email: string;

  @Column()
  fullName: string;                   // pre-concatenated for fast display

  @Column('simple-array')
  roles: string[];

  @Column()
  isActive: boolean;

  @Column({ type: 'timestamptz' })
  syncedAt: Date;                     // when was this shadow last updated
}
Step 2: The subscriber keeps it in sync
typescript// apps/api/src/modules/workflow-execution/subscribers/auth-events.subscriber.ts

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

Step 3: WorkflowExecution queries its own data only
typescript// apps/api/src/modules/workflow-execution/services/workflow-execution.service.ts

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
```
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
Pattern 1: JWT ClaimsPattern 2: Contract InterfacePattern 3: Shadow Read ModelUse whenData about current request userSynchronous lookup of specific entity by IDHigh-frequency queries, list views, joinsCouplingZero — no module importLoose — depends on interface not classZero — event-drivenLatencyZero — in-memoryLow — in-process service callZero — local DB queryConsistencyStrong (from login)Strong (live query)Eventually consistentMS extraction costZero — already worksSwap impl to gRPC clientZero — NATS already crosses processesCode change on extractionNoneOne line: swap provider implNoneWhere data livesJWT tokenOwning module's DBConsumer module's own shadow tableGood foruserId, tenantId, roles, email, planRare admin lookups, validationDashboards, lists, audit views

<!-- SECTION 1 END HERE -->

---


### Section 2: API Architecture Pattern

<!-- SECTION 2 BEGIN HERE -->

API Architecture Pattern
Recommendation: REST for external APIs, Internal Events via NATS
PatternVerdict for This SystemReasonREST✅ Primary APIStandard, well-understood, works perfectly for CRUD + resource operations, great tooling (Swagger/OpenAPI), statelessGraphQL❌ Not recommended as primaryOverkill for this use case — transitions and workflow execution are action-based, not graph-query-based. Also harder to implement auth middleware cleanly per fieldgRPC✅ Internal service-to-service onlyIf you split into microservices — gRPC for sync calls between services (faster than REST, schema-enforced via Protobuf)SSE (Server-Sent Events)✅ For real-time updatesWhen an approver is viewing an instance and another user transitions it, SSE pushes the update without pollingWebSockets⚠️ Only if bidirectional neededSSE is sufficient for this use case (server pushes to client, not the other way)
API Design Principles:

OpenAPI 3.0 spec — generated via NestJS @nestjs/swagger decorators
Versioning: URL-based (/api/v1/) — simplest, most explicit
Tenant context: tenant_id extracted from JWT, never from the request body (prevents tenant spoofing)
Idempotency: Transition requests include an idempotency_key header — duplicate requests are safely ignored

<!-- SECTION 2 END HERE -->

---

### Section 3: Microservice Design Patterns Catalogue

<!-- SECTION 3 BEGIN HERE -->

Microservice Design Patterns — Applied or Not
Since we're building a Modular Monolith designed for microservice extraction, here's how each pattern applies:
#PatternApply?Justification1Circuit Breaker✅ YesWrap all outbound calls (notification service, webhooks, external rule evaluators) with circuit breaker using nestjs-resilience or opossum. Prevents cascade failures.2Saga Pattern✅ Yes (Choreography-based)A workflow transition involves: (a) update instance, (b) write audit log, (c) send notification. If step (c) fails, we don't rollback (a) and (b). Use Saga to handle compensation — emit event, notification service retries independently.3Strangler Fig✅ Yes (Future)Start as modular monolith. As WorkflowExecutionModule becomes the bottleneck, extract it into its own service without touching other modules. The API Gateway routes to the new service transparently.4Database Per Service✅ Architecturally YesEach module owns its own repository layer and should not share table access across module boundaries. When extracted to microservices, each gets its own DB connection pool / schema.5Aggregator Pattern✅ YesThe Instance Detail view needs data from: instance (Execution Module) + audit logs (Audit Module) + user names (Auth Module). A BFF (Backend for Frontend) aggregator assembles this before sending to client.6API Gateway Pattern✅ YesSingle entry point for all client traffic. Handles JWT validation, tenant extraction, rate limiting, request routing. Use AWS API Gateway or Kong in production.7Sidecar Pattern✅ FutureWhen running in Kubernetes — attach a sidecar container for log shipping (Fluentd), mTLS (Envoy/Istio), and metrics scraping (Prometheus) without changing application code.8CQRS Pattern✅ YesSeparate read and write models. Write operations go through the Execution Engine (command side, strongly consistent). Read operations (list instances, audit history) hit optimized read models / replicas (query side).9Service Discovery✅ FutureIn a full microservice setup — use Kubernetes service DNS or Consul for services to find each other. In the monolith, in-process calls handle this.10Service Mesh⚠️ Future OnlyIstio/Linkerd is overengineering for initial build. Enable when you have 5+ services and need mutual TLS, traffic shaping, and distributed tracing between services automatically.11Event Sourcing✅ PartialThe audit_logs table IS essentially an event log — every state change is a stored event. For full event sourcing, the current state of an instance would be recomputed by replaying audit events. We implement a hybrid: store current state for fast reads, but audit log is the source of truth.12Service Decomposition✅ YesDecompose by business capability: Auth, Workflow Definition, Workflow Execution, Audit, Notification. Each has a single responsibility and clear bounded context.13Health Monitoring✅ YesEach service exposes /health (liveness) and /health/ready (readiness) endpoints. Kubernetes probes these. Prometheus scrapes metrics. Grafana dashboards alert on SLA breaches.14Bulkhead Pattern✅ YesTenant-level rate limiting at the API Gateway — a noisy tenant can't consume all resources. Thread pool isolation for the Rule Engine evaluation (CPU-bound work) — separate from I/O-bound HTTP handlers.15REST Caching✅ YesCache GET /workflow-definitions/:id responses in Redis (TTL = 5 minutes, invalidated on publish). Use HTTP ETag + Cache-Control headers on responses.16Polyglot Architecture✅ YesNestJS (TypeScript) for all services; PostgreSQL for relational data; Redis for caching; NATS for messaging. Each tool chosen for what it's best at — not one tech for everything.

<!-- SECTION 3 END HERE -->


--- 

### Section 4: Database Design

<!-- SECTION 4 BEGIN HERE -->

Is It Read-Heavy or Write-Heavy?
It is read-heavy, with write spikes.
OperationTypeFrequencyLoading workflow definitions (designer view)ReadMedium — only admins, infrequentListing instances (dashboard)ReadHigh — every user loads their queue on every loginLoading instance detail + audit historyReadHigh — every approver/requestor doing this constantlyLoading allowed transitionsReadHigh — every time a user views an instanceCreating an instanceWriteMediumExecuting a transition (state change + audit)WriteSpiky — burst during business hoursCreating/updating workflow definitionsWriteLow — admin-only, rare
Strategy:

Use read replicas in PostgreSQL (AWS RDS with Multi-AZ + Read Replicas)
Cache workflow definitions aggressively in Redis (they change rarely)
CQRS — separate read models for dashboards/lists from write models for execution

How must the DB be designed (scalability) and why?
Multi-tenant isolation choice

From the requirement, you may choose shared DB with tenant_id / schema per tenant / separate DB per tenant. 

problem

Recommended default: Shared DB + tenant_id (row-level tenant partitioning)

Why:

Fast onboarding (no provisioning per tenant)

Easier operations (one cluster)

Fits “many tenants” SaaS model

Can scale with:

composite indexes (tenant_id, ...)

partitioning by tenant_id or by time for audit tables

read replicas

When schema-per-tenant or DB-per-tenant is justified:

“Enterprise” tenants needing hard isolation, custom retention, or regulatory separation.

Core design principles

Every table includes tenant_id

Workflow definitions are versioned

Instances reference a specific workflow definition version

Audit log is append-only (no updates/deletes) 

problem

Enforce concurrency using optimistic locking/version column or transactional row locks for state changes (prevents double approvals).

---


<!-- SECTION 4 END HERE -->


---

### Section 5: Scalability Considerations

<!-- SECTION 5 BEGIN HERE -->

Scalability Considerations
ConcernSolutionHigh instance volume per tenantPartition workflow_instances and audit_logs by tenant_id (PostgreSQL table partitioning)Read-heavy audit log queriesSeparate read replica for audit log reads; writes go to primaryDefinition cachingCache workflow_definitions + workflow_states + workflow_transitions in Redis (TTL-based invalidation on publish)tenant_id on every queryComposite indexes on (tenant_id, created_at) on all main tablesLarge tenants outgrowing shared DBDesign the schema to support tenant sharding — a routing table maps tenant_id to a database shard

<!-- SECTION 5 END HERE -->

---

### Section 6: REFERENCES

<!-- SECTION 6 BEGIN HERE -->

## 12. Microservice or Monolith?

### Recommendation: **Modular Monolith first, architected for microservice extraction**

Here's the honest engineering reasoning:

| Factor | Monolith | Microservice |
|---|---|---|
| **Development Speed** | ✅ Faster to build | ❌ Slower — infra overhead |
| **Operational Complexity** | ✅ Simple deployment | ❌ Needs k8s, service discovery, distributed tracing |
| **Team Size** | ✅ Works for small teams | ❌ Needs multiple teams |
| **Inter-service calls** | ✅ In-process (fast) | ❌ Network calls (latency, failures) |
| **Independent Scaling** | ❌ Scale everything | ✅ Scale only execution engine |
| **Fault Isolation** | ❌ One crash, all down | ✅ Isolated failures |
| **Data Isolation** | ✅ Simple queries | ❌ Cross-service data management |

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

| Criterion | Why PostgreSQL Wins Here |
|---|---|
| **Workflow definitions** have strict relational structure — states reference transitions, transitions reference rules — **foreign keys and joins are essential** | ✅ SQL |
| **RBAC** — roles, users, permissions are deeply relational | ✅ SQL |
| **Audit logs** need guaranteed write ordering, immutability, and time-range queries | ✅ SQL |
| **Instance payloads** are tenant-specific flexible JSON blobs | ✅ PostgreSQL **JSONB** handles this natively — indexes, queries on JSON fields |
| **Multi-tenancy with `tenant_id`** — row-level security is a first-class PostgreSQL feature | ✅ SQL |
| **ACID transactions** — a state transition must atomically update the instance AND write the audit log | ✅ SQL is essential here |
| **Concurrent transition protection** — optimistic locking via `version` column is native in SQL | ✅ SQL |

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

| Strategy | Description | Pros | Cons |
|---|---|---|---|
| **Shared DB, Shared Schema** | All tenants in same tables, `tenant_id` column everywhere | Simple, cheap, easy to scale horizontally | Accidental data leakage if `tenant_id` forgotten in queries |
| **Shared DB, Separate Schema** | Each tenant gets a Postgres schema (`acme.workflows`, `school.workflows`) | Strong isolation, no `tenant_id` needed | Schema migrations need to run per tenant, complex |
| **Separate DB per tenant** | Each tenant has their own database | Maximum isolation | Extremely expensive, complex connection pooling |

**We choose: Shared DB, Shared Schema + PostgreSQL Row-Level Security (RLS)**

Why:
- **Row-Level Security** in PostgreSQL means the database itself enforces tenant isolation — even if your application code forgets to add `WHERE tenant_id = ?`, the DB rejects the query. This is a compliance-grade safeguard.
- **Cost effective** — one database cluster serves many tenants
- **Migrations are simple** — run once, applies to all tenants
- **Scalable** — can move a high-volume tenant to a dedicated read replica or eventually a separate DB (tenant sharding) when needed


<!-- SECTION 6 END HERE -->


### Section 7: Rule Engine Mental Picture

<!-- SECTION 7 BEGIN HERE -->

Where and How Is Business Logic / Conditions Executed?
This is the most conceptually complex part. Let me paint the mental picture clearly.
The Problem
A Tenant Admin types this rule in the UI:
amount > 10000 AND user.department == "Engineering"
This is a string. How does the server execute it?
The Rule Engine — Mental Picture
Think of it like Excel formulas. When you type =SUM(A1:A10) in Excel, Excel has an interpreter that reads your string, understands it as an expression, and evaluates it against the cell data. You didn't write code — but Excel's engine runs logic on your behalf.
The Rule Engine in our system works the same way:
Step 1 — Storage: The rule is stored as a string (or structured JSON AST) in the database
```
json{
  "type": "AND",
  "conditions": [
    { "field": "payload.amount", "operator": ">", "value": 10000 },
    { "field": "user.department", "operator": "==", "value": "Engineering" }
  ]
}
Step 2 — Context Building: At runtime, the execution service builds a context object
json{
  "payload": { "amount": 15000, "vendor": "Acme" },
  "user": { "id": "u1", "role": "Requestor", "department": "Engineering" },
  "instance": { "current_state": "Draft", "created_at": "2026-01-01" }
}
```

**Step 3 — Evaluation**: The Rule Engine receives the rule AST + context, walks the tree, and evaluates:
```
amount(15000) > 10000 → TRUE
department("Engineering") == "Engineering" → TRUE
AND(TRUE, TRUE) → TRUE ✅ → Transition is allowed
```

**Step 4 — Decision**: Based on the result, the transition is either allowed or blocked.

### Rule Engine Options

| Approach | What it is | When to use |
|---|---|---|
| **JSON Rules Engine** (`json-rules-engine` library) | Pre-built evaluator for JSON-defined conditions | ✅ Best for this use case — fast, safe, extensible |
| **Expression evaluator** (`expr-eval`, `jexl`) | Evaluates math/logic string expressions | Good for power users who want formula-like syntax |
| **Strategy Pattern (hardcoded)** | Write a TypeScript class per rule type | Only if rules are few and fixed |
| **Sandboxed JS eval** (`vm2`, `isolated-vm`) | Executes actual JS code written by tenant | Powerful but dangerous — security risk |

**We'll use `json-rules-engine`** — it's safe (no code injection risk), expressive, and the rule structure is serializable to the database.


<!-- SECTION 7 END HERE -->

---

### Section 8: Business Point of View

<!-- SECTION 8 BEGIN HERE -->

Who Will Onboard the Platform?
B2B companies — businesses, not individual consumers. Examples:
IndustryUse CaseFinance / ProcurementPurchase approval, expense claimsHROnboarding, offboarding, leave approvalsSoftware / ITBug lifecycle, change request managementHealthcarePatient intake workflows, discharge approvalsLegalContract review and sign-off workflowsE-commerceReturn/refund approval processesEducationAdmission workflows, faculty request approvals
Each company onboards as a tenant. Their employees are tenant-level users. They define their own workflows, their own roles, their own rules — all within the shared platform.

<!-- SECTION 8 END HERE -->

---


### Section 9: Actors and Personas

<!-- SECTION 9 BEGIN HERE -->

The Actors / Personas
There are two layers of actors:
Layer 1 — Platform Level (Your SaaS)
ActorWho They AreWhat They DoSuper Admin / Platform OwnerYou (the company that built this)Onboards tenants, manages billing, monitors platform health
Layer 2 — Tenant Level (Per Company)
ActorWho They AreWhat They DoTenant AdminThe IT/Ops manager of Company XCreates workflow definitions, manages roles, users, and rules for their orgApproverA manager or senior personReviews and approves/rejects workflow instancesRequestorAn employeeInitiates a workflow instance (e.g., submits a purchase request)Viewer (optional)Auditor, read-only stakeholderCan view instances and audit logs but cannot take action

The Tenant Admin is the power user. The Requestor and Approver are the daily operators.

<!-- SECTION 9 END HERE -->

---

### Section 10: Foundation

<!-- SECTION 10 BEGIN HERE -->

What is a workflow engine platform?

A workflow engine platform is a system that runs business processes described as:

States (where something is now)

Transitions (how it moves)

Rules/conditions (when it’s allowed)

Actors/roles (who can do it)

History/audit (what happened)

It has two big halves:

Workflow Definition (design-time): create/validate/version workflows

Workflow Execution (run-time): start instances, advance steps, enforce rules, record audit

<!-- SECTION 10 END HERE -->

---

### Section 11: Tenancy Models Available and Recommendation

> Include this part in FAQ as well

<!-- SECTION 11 BEGIN HERE -->
Tenancy models available

Shared DB, shared schema (tenant_id column everywhere)

Shared DB, schema-per-tenant

Separate DB per tenant

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

Operationally feasible at 10k tenants

Easier to scale horizontally (sharding/partitioning)

Faster onboarding (no schema creation per tenant)

Better for multi-tenant analytics and global ops

But: You must design isolation seriously:

Row-level isolation (tenant_id enforced)

Partitioning by tenant / time

Per-tenant encryption context

Strict authZ checks

Audit immutability

Enterprise add-on:

Offer DB-per-tenant as a premium tier for HIPAA/financial customers when required.

How do we isolate data securely?

Use defense-in-depth:

AuthN: tenant-aware identity (JWT contains tenant_id)

AuthZ: RBAC + per-workflow permissions

Mandatory tenant filter: every query scoped by tenant_id (enforced centrally)

Row-level security (optional) at DB for extra safety

Encryption:

at rest (KMS-managed)

in transit (TLS)

optional per-tenant keys / encryption context

No cross-tenant logging: logs and traces must carry tenant_id and be access-controlled

Rate limits per tenant to prevent noisy neighbor

<!-- SECTION 11 END HERE -->


### Section 12: Workflow Execution Model
Workflow Execution Model
17) Where are workflows stored?

In your platform persistence:

Workflow Definition (versioned): states, transitions, rules, role permissions

Definition metadata: published/draft, version graph, validation status

18) Where are workflows executed?

In the workflow runtime/execution service:

It loads the definition (by version)

Applies transitions on instances

Writes state updates + audit entries

Emits events to messaging

Execution is stateless compute + durable persistence.

19) Execution lifecycle (core)

Definition created → validated → published (version locked)

Instance created from a definition version

Instance waits in a state

A transition request arrives (user action or system event)

Engine checks:

allowed role?

condition true?

concurrency safe?

Engine persists:

new state

task updates

immutable audit record

Engine emits events/webhooks

20) Where does business logic live?

Three tiers (important mental model):

Engine invariants (platform-owned):

state machine rules, idempotency, concurrency, audit immutability

Tenant configuration (data, not code):

states/transitions/conditions/roles

Tenant domain logic (outside engine):

“reserve inventory”, “create invoice”, “update student attendance”

done via connectors (HTTP, queues, workers, webhooks)

This is how “school vs e-commerce” both work: the engine orchestrates; domain logic runs in tenant systems or tenant-specific workers.

21) How are conditions evaluated?

A rule evaluator that takes:

transition request

instance data (custom fields)

user context (roles)

possibly external facts (fetched via connector)

Common approach:

expression-based rules (safe DSL)

plus “pluggable predicates” for advanced enterprise needs

22) Interpreted or compiled?

For a SaaS workflow designer:

Interpreted is the standard: flexible, safe, easy to version and audit.

“Compiled” only makes sense if you generate code or bytecode—adds risk and complexity.

Recommendation: interpreted rules + strict sandboxing.

23) Mental execution flow (trigger → orchestration → task → completion)

Trigger

User clicks “Submit”

Or external event arrives (“payment_succeeded”)

Orchestration

Engine loads definition vN

Finds valid next transitions

Task execution

If transition includes “call external system”, it enqueues a task/event

Worker executes and reports back

Completion

Engine applies resulting transition

Writes audit

Emits notifications/events

<!-- SECTION 12 END HERE -->

---



