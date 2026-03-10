---
title: Product Requirements Document (PRD)
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# Product Requirements Document (PRD)

## Table of Contents

- [1. Product Overview](#1-product-overview)
  - [1.1 Problem Statement](#11-problem-statement)
  - [1.2 Target Users](#12-target-users)
  - [1.3 Core Value Proposition](#13-core-value-proposition)
- [2. Functional Requirements](#2-functional-requirements)
  - [2.1 Authentication & User Management](#21-authentication--user-management)
    - [Feature: Tenant onboarding (company signup)](#feature-tenant-onboarding-company-signup)
    - [Feature: Employee self-registration](#feature-employee-self-registration)
    - [Feature: Login / session lifecycle](#feature-login--session-lifecycle)
    - [Feature: Current session hydration](#feature-current-session-hydration)
    - [Feature: Admin creates users](#feature-admin-creates-users)
    - [Feature: Assign roles to users](#feature-assign-roles-to-users)
  - [2.2 Tenant Management](#22-tenant-management)
    - [Feature: Tenant detail and settings reads](#feature-tenant-detail-and-settings-reads)
  - [2.3 Workflow Definition Management](#23-workflow-definition-management)
    - [Feature: Create and browse workflow definitions](#feature-create-and-browse-workflow-definitions)
    - [Feature: Manage workflow states (draft)](#feature-manage-workflow-states-draft)
    - [Feature: Manage workflow transitions (draft)](#feature-manage-workflow-transitions-draft)
    - [Feature: Instance form schema generation (from rules)](#feature-instance-form-schema-generation-from-rules)
    - [Feature: Publish and version workflows](#feature-publish-and-version-workflows)
  - [2.4 Workflow Execution](#24-workflow-execution)
    - [Feature: Create and browse workflow instances](#feature-create-and-browse-workflow-instances)
    - [Feature: Allowed transitions discovery](#feature-allowed-transitions-discovery)
    - [Feature: Execute a transition (with optimistic locking + idempotency)](#feature-execute-a-transition-with-optimistic-locking--idempotency)
    - [Feature: Completion and cancellation](#feature-completion-and-cancellation)
  - [2.5 Rule Management](#25-rule-management)
    - [Feature: Rule builder metadata discovery](#feature-rule-builder-metadata-discovery)
    - [Feature: Attach rules to transitions](#feature-attach-rules-to-transitions)
    - [Feature: List transition rules](#feature-list-transition-rules)
  - [2.6 Audit & Reporting](#26-audit--reporting)
    - [Feature: Query instance audit logs](#feature-query-instance-audit-logs)
  - [2.7 Roles & Access Management](#27-roles--access-management)
    - [Feature: List and create tenant roles](#feature-list-and-create-tenant-roles)
- [3. Non-Functional Requirements](#3-non-functional-requirements)
  - [3.1 Performance Requirements](#31-performance-requirements)
  - [3.2 Security Requirements (API-layer only)](#32-security-requirements-api-layer-only)
  - [3.3 Reliability Requirements](#33-reliability-requirements)
  - [3.4 Scalability Requirements (API-layer targets)](#34-scalability-requirements-api-layer-targets)
- [4. Integration Requirements](#4-integration-requirements)
  - [4.1 Frontend ↔ Backend Integration Contract](#41-frontend--backend-integration-contract)
  - [4.2 Authentication Flow (end-to-end)](#42-authentication-flow-end-to-end)
  - [4.3 Error Handling Contract](#43-error-handling-contract)
  - [4.4 Real-Time / WebSocket Requirements (if any)](#44-real-time--websocket-requirements-if-any)
  - [4.5 File Upload / Download Requirements (if any)](#45-file-upload--download-requirements-if-any)
- [5. Constraints](#5-constraints)
  - [5.1 Technical Constraints](#51-technical-constraints)
  - [5.2 Business Constraints](#52-business-constraints)
  - [5.3 Compliance Constraints](#53-compliance-constraints)
- [6. Out of Scope](#6-out-of-scope)
- [Appendix A. Embedded Reference Sections (verbatim)](#appendix-a-embedded-reference-sections-verbatim)
  - [Section 1: Microservice-Extractable Contract-First Modular Monolith](#section-1-microservice-extractable-contract-first-modular-monolith)
  - [Section 2: Contract-First Module Boundaries (Hard Rules)](#section-2-contract-first-module-boundaries-hard-rules)
  - [Section 3: CQRS (Command/Query Separation) — When and Why](#section-3-cqrs-commandquery-separation--when-and-why)
  - [Section 4: Multi-Tenancy & Tenant Isolation (RLS)](#section-4-multi-tenancy--tenant-isolation-rls)
  - [Section 5: Idempotency & Exactly-Once Effects (Practical)](#section-5-idempotency--exactly-once-effects-practical)
  - [Section 6: Eventing Rules (NATS) — Publishing and Consuming](#section-6-eventing-rules-nats--publishing-and-consuming)
  - [Section 7: Workflow Definition Versioning & Snapshots](#section-7-workflow-definition-versioning--snapshots)
  - [Section 8: Database Design Rules](#section-8-database-design-rules)
  - [Section 9: API Design Rules](#section-9-api-design-rules)
  - [Section 10: Frontend Data Fetching & Caching Rules](#section-10-frontend-data-fetching--caching-rules)
  - [Section 11: Error Handling Rules](#section-11-error-handling-rules)
  - [Section 12: Security Baselines](#section-12-security-baselines)

## 1. Product Overview

### 1.1 Problem Statement

Teams need a secure, multi-tenant workflow engine where:

- workflow designers can author and publish process definitions (states, transitions, rules)
- runtime users can create workflow instances, discover allowed actions, and execute transitions safely
- clients can integrate predictably through a stable REST API contract with consistent validation and error handling

This PRD defines requirements strictly for **frontend ↔ backend API interactions and integration contracts** (no infrastructure/ops details).

### 1.2 Target Users

| User Type                  | Description                                                     | Primary API Surfaces                                                                  |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tenant Admin               | Onboards tenant, manages users/roles, oversees workflows        | `/auth/*`, `/users`, `/roles`, `/tenants/*`, `/workflow-definitions/*`                |
| Workflow Designer          | Authors draft workflows and publishes versions                  | `/workflow-definitions/*`, `/workflow-rules/metadata`                                 |
| Runtime User / Approver    | Executes transitions on instances, adds comments, views history | `/workflow-instances/*`, `/workflow-instances/:id/allowed-transitions`, `/audit-logs` |
| Read-only Viewer / Auditor | Views instances and audit trails                                | `/workflow-instances/*`, `/workflow-instances/:id/audit-logs`                         |

### 1.3 Core Value Proposition

| Value                     | What the API enables                                 | Proof point / Contract anchor                                                                      |
| ------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Fast onboarding           | Single call to create tenant + first admin           | `POST /api/v1/auth/register/tenant`                                                                |
| Safe execution            | Optimistic locking + retry-safe execution            | `POST /api/v1/workflow-instances/:id/transitions` with `lastKnownVersion` + `idempotencyKey`       |
| Low-coupling integrations | Contract-first, versioned REST endpoints             | Stable `/api/v1/*` surface; OpenAPI as source-of-truth                                             |
| Designer-friendly         | Discoverable rule vocabulary and derived form schema | `GET /api/v1/workflow-rules/metadata`, `GET /api/v1/workflow-definitions/:id/instance-form-schema` |

## 2. Functional Requirements

> Source of user journey and endpoint sequencing: `backend/USER_API_FLOW.md`.

### 2.1 Authentication & User Management

#### Feature: Tenant onboarding (company signup)

| User Story                                                                                | Acceptance Criteria                                                                                                                                                                              | Priority | API Endpoint(s)                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------: | ----------------------------------- |
| As a new company admin, I can create a tenant and become the first admin user in one step | - Request validates required fields (tenant + user) and returns tokens on success<br>- Response includes tenant identifiers sufficient to establish tenant context (`tenantId` and `tenantSlug`) |       P0 | `POST /api/v1/auth/register/tenant` |
| As the client, I can hydrate my session immediately after onboarding                      | - Calling “me” with the returned access token returns the current user payload in the standard response wrapper                                                                                  |       P0 | `GET /api/v1/auth/me`               |

#### Feature: Employee self-registration

| User Story                                                                 | Acceptance Criteria                                                        | Priority | API Endpoint(s)              |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------: | ---------------------------- |
| As an employee, I can self-register into an existing tenant by tenant slug | - Request uses `tenantSlug` (not `tenantId`) and returns tokens on success |       P1 | `POST /api/v1/auth/register` |

#### Feature: Login / session lifecycle

| User Story                                                               | Acceptance Criteria                                                                                                        | Priority | API Endpoint(s)             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------: | --------------------------- |
| As a user, I can log in to a specific tenant context                     | - Request requires `tenantId` and credentials<br>- Returns an access+refresh token pair on success                         |       P0 | `POST /api/v1/auth/login`   |
| As a client, I can refresh an expired access token using a refresh token | - Refresh rotates token(s) and returns a new pair (per contract)<br>- Refresh failure yields a consistent auth error shape |       P0 | `POST /api/v1/auth/refresh` |
| As a user, I can log out and invalidate my session                       | - Logout completes without leaking tenant/user data in response                                                            |       P1 | `POST /api/v1/auth/logout`  |

#### Feature: Current session hydration

| User Story                                                                                    | Acceptance Criteria                                                                           | Priority | API Endpoint(s)       |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------: | --------------------- |
| As a client, I can fetch the currently authenticated user and derived claims for UI hydration | - Works after onboarding, self-registration, and login flows<br>- Requires valid access token |       P0 | `GET /api/v1/auth/me` |

#### Feature: Admin creates users

| User Story                                             | Acceptance Criteria                                                                                                                   | Priority | API Endpoint(s)                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------: | ----------------------------------- |
| As a tenant admin, I can create users within my tenant | - Request can include optional `roleNames`<br>- Tenant scoping is derived from auth context (client does not send `tenantId` in body) |       P1 | `POST /api/v1/users`                |
| As a tenant admin, I can browse users with pagination  | - Supports `page` and `limit` parameters<br>- Returns deterministic ordering for stable pagination                                    |       P1 | `GET /api/v1/users?page=1&limit=20` |
| As a tenant admin, I can view a user profile by id     | - Returns `404` if user is not visible in current tenant context                                                                      |       P1 | `GET /api/v1/users/:id`             |

#### Feature: Assign roles to users

| User Story                                       | Acceptance Criteria                                                                                                           | Priority | API Endpoint(s)                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------: | ------------------------------ |
| As a tenant admin, I can assign a role to a user | - Accepts a `roleId` created/listed in current tenant<br>- Role assignment changes are visible in subsequent `GET /users/:id` |       P1 | `POST /api/v1/users/:id/roles` |

### 2.2 Tenant Management

#### Feature: Tenant detail and settings reads

| User Story                                                                 | Acceptance Criteria                                                                    | Priority | API Endpoint(s)                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------: | ---------------------------------- |
| As an authenticated user, I can view tenant details for my current tenant  | - Returns tenant details only for tenant in current auth context or authorized access  |       P1 | `GET /api/v1/tenants/:id`          |
| As an authenticated user, I can view tenant settings for my current tenant | - Returns tenant settings only for tenant in current auth context or authorized access |       P1 | `GET /api/v1/tenants/:id/settings` |

### 2.3 Workflow Definition Management

#### Feature: Create and browse workflow definitions

| User Story                                                       | Acceptance Criteria                                                                                       | Priority | API Endpoint(s)                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------: | -------------------------------------------------- |
| As a workflow designer, I can create a draft workflow definition | - Returns a new `workflowDefinitionId`<br>- Draft is editable via the state/transition/rule sub-resources |       P0 | `POST /api/v1/workflow-definitions`                |
| As a designer, I can list workflow definitions with pagination   | - Supports `page` and `limit` parameters                                                                  |       P1 | `GET /api/v1/workflow-definitions?page=1&limit=20` |
| As a designer, I can view a workflow definition by id            | - Returns the draft/published status and current version info (per contract)                              |       P1 | `GET /api/v1/workflow-definitions/:id`             |

#### Feature: Manage workflow states (draft)

| User Story                                             | Acceptance Criteria                                                                                                    | Priority | API Endpoint(s)                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------: | -------------------------------------------------------------- |
| As a designer, I can list states for a draft workflow  | - Supports `page` and `limit` parameters (typically `limit=100`)                                                       |       P0 | `GET /api/v1/workflow-definitions/:id/states?page=1&limit=100` |
| As a designer, I can add a state to the draft workflow | - Allows specifying `isInitial` / `isTerminal` and canvas positions (`positionX`, `positionY`) and optional `metadata` |       P0 | `POST /api/v1/workflow-definitions/:id/states`                 |
| As a designer, I can read a state by id                | - Returns `404` if state not found or not visible to current tenant                                                    |       P1 | `GET /api/v1/workflow-definitions/:id/states/:stateId`         |
| As a designer, I can update a state                    | - Patch semantics are supported for nullable fields; omitted fields are unchanged                                      |       P1 | `PATCH /api/v1/workflow-definitions/:id/states/:stateId`       |
| As a designer, I can delete a state                    | - Deleting a state removes it from subsequent state listings                                                           |       P1 | `DELETE /api/v1/workflow-definitions/:id/states/:stateId`      |

#### Feature: Manage workflow transitions (draft)

| User Story                                                                   | Acceptance Criteria                                                                           | Priority | API Endpoint(s)                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------- |
| As a designer, I can list transitions for a draft workflow                   | - Supports `page` and `limit` parameters (typically `limit=100`)                              |       P0 | `GET /api/v1/workflow-definitions/:id/transitions?page=1&limit=100` |
| As a designer, I can create a transition between two states                  | - Requires `fromStateId` and `toStateId`<br>- Supports `allowedRoleIds` and `requiresComment` |       P0 | `POST /api/v1/workflow-definitions/:id/transitions`                 |
| As a designer, I can read a transition by id                                 | - Returns `404` if transition not found or not visible to current tenant                      |       P1 | `GET /api/v1/workflow-definitions/:id/transitions/:transitionId`    |
| As a designer, I can delete a transition                                     | - Deleting a transition removes it from subsequent transition listings                        |       P1 | `DELETE /api/v1/workflow-definitions/:id/transitions/:transitionId` |
| As a client, I understand how to “edit” a transition despite no update route | - Product behavior: if a transition must change, UI uses delete+recreate flow                 |       P1 | (No update route; use delete+create)                                |

#### Feature: Instance form schema generation (from rules)

| User Story                                                                             | Acceptance Criteria                                                                                                 | Priority | API Endpoint(s)                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------: | ----------------------------------------------------------- |
| As a designer, I can retrieve the consolidated instance form schema derived from rules | - Schema reflects `schemaFields` provided when creating rules<br>- Schema is usable by runtime instance creation UI |       P0 | `GET /api/v1/workflow-definitions/:id/instance-form-schema` |

#### Feature: Publish and version workflows

| User Story                                                                  | Acceptance Criteria                                                     | Priority | API Endpoint(s)                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------: | -------------------------------------------------------------- |
| As a designer, I can publish a workflow definition so it becomes executable | - Publish transitions definition into an immutable snapshot for runtime |       P0 | `POST /api/v1/workflow-definitions/:id/publish`                |
| As a designer, I can list workflow versions after publish                   | - Returns versions list for UI and audit                                |       P1 | `GET /api/v1/workflow-definitions/:id/versions`                |
| As a designer, I can view a specific workflow version                       | - Returns the immutable snapshot content for versioned browsing         |       P1 | `GET /api/v1/workflow-definitions/:id/versions/:versionNumber` |
| As a designer/admin, I can optionally deprecate a workflow definition       | - Deprecation is reflected in subsequent reads/listings (per contract)  |       P2 | `POST /api/v1/workflow-definitions/:id/deprecate`              |

### 2.4 Workflow Execution

#### Feature: Create and browse workflow instances

| User Story                                                                       | Acceptance Criteria                                                                                                      | Priority | API Endpoint(s)                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| As a runtime user, I can create a workflow instance with an initial payload      | - Requires `workflowDefinitionId` and `payload`<br>- Response includes an `instanceId` and initial `version`             |       P0 | `POST /api/v1/workflow-instances`                                                                                                                                                                                 |
| As a user, I can browse workflow instances with filters                          | - Supports pagination (`page`, `limit`)<br>- Supports filtering by `status` and/or `workflowDefinitionId` (per contract) |       P1 | `GET /api/v1/workflow-instances?page=1&limit=20`<br>`GET /api/v1/workflow-instances?status=ACTIVE&page=1&limit=20`<br>`GET /api/v1/workflow-instances?workflowDefinitionId=:workflowDefinitionId&page=1&limit=20` |
| As a user, I can view a specific workflow instance and its current version/state | - Includes current `version` needed for optimistic locking on execution                                                  |       P0 | `GET /api/v1/workflow-instances/:id`                                                                                                                                                                              |

#### Feature: Allowed transitions discovery

| User Story                                                                         | Acceptance Criteria                                                                                                                                                                                                 | Priority | API Endpoint(s)                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | -------------------------------------------------------- |
| As a runtime user, I can discover actions available to me for the current instance | - Endpoint returns a raw array (not `{status,data}` wrapper) and client must handle that shape<br>- Actions are filtered by state + role access, but are not guaranteed to succeed (rules validated during execute) |       P0 | `GET /api/v1/workflow-instances/:id/allowed-transitions` |

#### Feature: Execute a transition (with optimistic locking + idempotency)

| User Story                                                             | Acceptance Criteria                                                                                                                                                                                                                                                                     | Priority | API Endpoint(s)                                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------ |
| As a runtime user, I can execute a transition to progress the workflow | - Request requires `transitionId` and `lastKnownVersion` (exact field name)<br>- If transition requires comment, request includes `comment` and server validates requirement<br>- On version mismatch, server returns a conflict error and client can re-fetch instance to retry safely |       P0 | `POST /api/v1/workflow-instances/:id/transitions`                                                |
| As a client, I can make transition execution retry-safe                | - Client may pass `idempotencyKey` to allow safe retries without duplicate effects                                                                                                                                                                                                      |       P1 | `POST /api/v1/workflow-instances/:id/transitions`                                                |
| As a client, I can refresh instance and next actions after execution   | - After success, client can re-fetch instance and allowed transitions to update UI state                                                                                                                                                                                                |       P0 | `GET /api/v1/workflow-instances/:id`<br>`GET /api/v1/workflow-instances/:id/allowed-transitions` |

#### Feature: Completion and cancellation

| User Story                                                     | Acceptance Criteria                                                     | Priority | API Endpoint(s)                                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | -------: | --------------------------------------------------------------------------------------------------------- |
| As a user, I can detect completion and see completed instances | - Completed instances are queryable by status filter and viewable by id |       P1 | `GET /api/v1/workflow-instances?status=COMPLETED&page=1&limit=20`<br>`GET /api/v1/workflow-instances/:id` |
| As a runtime user/admin, I can cancel an instance              | - Cancellation is available as an explicit runtime action               |       P2 | `POST /api/v1/workflow-instances/:id/cancel`                                                              |

### 2.5 Rule Management

#### Feature: Rule builder metadata discovery

| User Story                                                                                                 | Acceptance Criteria                                                                   | Priority | API Endpoint(s)                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------: | ------------------------------------- |
| As a designer, I can discover supported rule facts/operators/strategies to drive a dynamic rule-builder UI | - Endpoint returns metadata sufficient to build UI without hardcoding rule vocabulary |       P0 | `GET /api/v1/workflow-rules/metadata` |

#### Feature: Attach rules to transitions

| User Story                                         | Acceptance Criteria                                                                                                                                   | Priority | API Endpoint(s)                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ----------------------------------------------------------------------- |
| As a designer, I can attach a rule to a transition | - Accepts `ruleDefinition` and optional `schemaFields` and `evaluationOrder`<br>- Rule creation updates derived instance form schema for the workflow |       P0 | `POST /api/v1/workflow-definitions/:id/transitions/:transitionId/rules` |

#### Feature: List transition rules

| User Story                                            | Acceptance Criteria                                                                                                                                                  | Priority | API Endpoint(s)                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ---------------------------------------------------------------------- |
| As a designer, I can list rules for a transition      | - Returns ordered rules (per `evaluationOrder` contract)                                                                                                             |       P1 | `GET /api/v1/workflow-definitions/:id/transitions/:transitionId/rules` |
| As a client, I understand limitations on rule editing | - Product behavior: no update/delete route is part of the visible surface; UI should treat rules as append-only or require full re-authoring via supported endpoints |       P2 | (No update/delete route; design constraint)                            |

### 2.6 Audit & Reporting

#### Feature: Query instance audit logs

| User Story                                                                | Acceptance Criteria                                                           | Priority | API Endpoint(s)                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------: | --------------------------------------------------------------- |
| As a user, I can view a timeline of what happened for a workflow instance | - Paginated audit log query supports timeline/history UI with stable ordering |       P0 | `GET /api/v1/workflow-instances/:id/audit-logs?page=1&limit=20` |

### 2.7 Roles & Access Management

#### Feature: List and create tenant roles

| User Story                                                                   | Acceptance Criteria                                                       | Priority | API Endpoint(s)      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------: | -------------------- |
| As a tenant admin, I can list roles to configure transitions and user access | - Returns role list for current tenant context                            |       P0 | `GET /api/v1/roles`  |
| As a tenant admin, I can create custom roles                                 | - Created roles are available for assignment and transition configuration |       P1 | `POST /api/v1/roles` |

## 3. Non-Functional Requirements

> These targets apply to the **API and integration layer only** (frontend ↔ backend). They do not define infrastructure, deployment topology, or ops runbooks.

### 3.1 Performance Requirements

| Requirement                                  | Target                                                                     | Measurement                                        |
| -------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| P95 latency for read endpoints               | \( \le 300ms \) for common reads under normal load                         | APM/trace spans measured at API gateway / app edge |
| P95 latency for write endpoints              | \( \le 600ms \) for typical mutations (excluding long-running async work)  | APM/trace spans                                    |
| Allowed transitions discovery responsiveness | \( \le 400ms \) P95 for `allowed-transitions`                              | Endpoint timing histogram                          |
| Pagination throughput                        | Sustain at least 20 req/s per tenant on list endpoints with stable results | Load test per-tenant                               |

### 3.2 Security Requirements (API-layer only)

| Requirement                                            | Target                                                                             | Measurement                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Authenticated access                                   | Protected endpoints require valid JWT access token                                 | Automated API tests (401/403)                               |
| Tenant isolation                                       | Requests can only access data within current tenant context                        | Multi-tenant test suite (cross-tenant access attempts fail) |
| CSRF protections for browser clients (if cookies used) | CSRF token must be validated for state-changing requests                           | Integration tests covering CSRF interceptor/headers         |
| Input validation                                       | All request bodies and params are validated; invalid requests yield consistent 4xx | Contract tests for DTO validation                           |
| Webhook signature verification (if webhooks exist)     | HMAC verification must be enforced for inbound webhooks                            | Security tests (invalid signature rejected)                 |

[ASSUMPTION: Webhooks are not part of the current visible API surface in `USER_API_FLOW.md`; keep this as a forward-compatible security requirement if/when notifications/webhooks are exposed.]

### 3.3 Reliability Requirements

| Requirement                        | Target                                                                              | Measurement                           |
| ---------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- |
| Idempotent transition execution    | Duplicate client retries with same `idempotencyKey` do not create duplicate effects | Integration tests: replay requests    |
| Optimistic concurrency correctness | Version conflicts return deterministic error and do not corrupt instance state      | Concurrency tests (parallel executes) |
| Error contract stability           | Backend error shape is consistent across endpoints                                  | Contract snapshot tests               |
| Token refresh reliability          | Refresh endpoint supports smooth session continuation                               | E2E login/refresh tests               |

### 3.4 Scalability Requirements (API-layer targets)

| Requirement                         | Target                                                                                           | Measurement                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Tenant-aware rate limiting behavior | API enforces per-tenant/user throttling and returns consistent 429 responses                     | Load tests per tenant; verify headers/body |
| Pagination at scale                 | List endpoints remain stable under large dataset sizes (no missing/duplicate items across pages) | Backfill tests; pagination invariants      |
| Stateless API behavior              | API instances remain stateless aside from auth/session tokens and explicit cached reads          | Architecture/contract review               |

## 4. Integration Requirements

### 4.1 Frontend ↔ Backend Integration Contract

| Contract Area        | Requirement                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| API Prefix           | All REST endpoints use the `/api/v1` prefix (per `backend/USER_API_FLOW.md`).                                           |
| Response Envelope    | Most endpoints return a standard `{ status, data, ... }`-style wrapper (per OpenAPI `ApiResponseDto`).                  |
| Exception: Raw array | `GET /api/v1/workflow-instances/:id/allowed-transitions` returns a raw array and clients must handle this special case. |
| Pagination           | List endpoints accept `page` and `limit` query parameters.                                                              |
| Optimistic locking   | Transition execution uses `lastKnownVersion` (exact field name) and server rejects stale versions.                      |
| Tenant context       | Tenant scoping is derived from auth context; clients do not send tenantId in most request bodies (except login).        |

### 4.2 Authentication Flow (end-to-end)

| Flow                          | Required Steps                                          | Endpoints                                     |
| ----------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| New tenant onboarding         | Create tenant+admin → hydrate session                   | `POST /auth/register/tenant` → `GET /auth/me` |
| Employee join (self-register) | Register with `tenantSlug` → (optional) hydrate session | `POST /auth/register` → `GET /auth/me`        |
| Returning user login          | Authenticate with `tenantId` → hydrate session          | `POST /auth/login` → `GET /auth/me`           |
| Session maintenance           | Refresh on expiry → logout                              | `POST /auth/refresh` → `POST /auth/logout`    |

### 4.3 Error Handling Contract

| Scenario                               | Required Behavior                           | Consumer (frontend) behavior                                                   |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| Validation failure                     | 4xx response with field-level error details | Display inline form errors and block submit                                    |
| Unauthorized                           | 401                                         | Trigger token refresh (if applicable) or redirect to login                     |
| Forbidden (role/tenant restriction)    | 403                                         | Show “not authorized” and hide actions                                         |
| Not found                              | 404                                         | Show “not found” states (user/resource missing in tenant context)              |
| Version conflict on transition execute | 409 (or explicit conflict error)            | Re-fetch instance, re-discover allowed transitions, retry with updated version |
| Rate limited                           | 429                                         | Backoff + show user feedback (try again later)                                 |

[ASSUMPTION: Exact error payload fields are defined by the global exception filter + DTO validation setup and should be treated as contract-stable; confirm exact JSON shapes against `backend/OPEN_API_SPEC.json` when implementing client error parsing.]

### 4.4 Real-Time / WebSocket Requirements (if any)

No real-time (SSE/WebSocket) requirements are included in the current frontend journey (`backend/USER_API_FLOW.md`).

[ASSUMPTION: If real-time updates are introduced later (e.g., instance state changes), they must be additive and not break REST polling flows.]

### 4.5 File Upload / Download Requirements (if any)

No file upload/download requirements are included in the current frontend journey (`backend/USER_API_FLOW.md`).

## 5. Constraints

### 5.1 Technical Constraints

| Constraint                       | Implication for API/Integration                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Contract-first modular monolith  | Client integrations must not rely on cross-module internal DB shapes; only use published REST endpoints |
| API version prefix               | New endpoints must land under `/api/v1` and remain backward compatible within the major version         |
| Transition execution concurrency | Clients must always send `lastKnownVersion` from latest instance read                                   |
| Special-case response shape      | Client must handle `allowed-transitions` as a raw array                                                 |

### 5.2 Business Constraints

| Constraint            | Implication                                                                       |
| --------------------- | --------------------------------------------------------------------------------- |
| Self-serve onboarding | Tenant onboarding must be a single “happy-path” API call (`register/tenant`)      |
| Multi-tenant SaaS     | All client-visible resources are tenant-scoped; cross-tenant access is prohibited |

### 5.3 Compliance Constraints

| Constraint   | Implication                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Auditability | All user-visible workflow actions must be queryable via audit APIs for compliance-driven tenants |

## 6. Out of Scope

This PRD intentionally does **not** define:

- infrastructure, deployment, or ops procedures (CI/CD, hosting, scaling topology, observability tooling configuration)
- database physical design specifics beyond what is required for the API contract (see `05-DATABASE-DESIGN.md` for DB-focused documentation)
- internal module implementations (LLD/HLD) outside what is required to consume the API
- microservice extraction plan (see `10-MIGRATION-GUIDE.md` when generated)

---

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

JWT Payload (set at login, read everywhere):

```ts
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

TenantController:

```ts
  createSomething(@CurrentUser() user: JwtPayload) {
    // user.tenantId, user.roles, user.email — all available
    // No AuthModule import needed
  }
```

What lives in the JWT

Populate the JWT intelligently at login time. Include fields that are frequently needed across modules.

libs/shared/src/interfaces/jwt-payload.interface.ts

```ts
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

When a module needs data about a specific entity owned by another module.

Examples:

WorkflowExecution needs to know which roles a user has → Auth owns roles.

Audit needs to know user metadata → Auth owns user.

Wrong approach

Importing repositories or entities across module boundaries.

That creates tight coupling and makes extraction impossible.

Correct approach

The owning module exports a contract interface and implementation.

The consuming module injects it by token.

AuthModule exports:

libs/contracts/src/auth/auth.contract.ts

```ts
export const AUTH_CONTRACT = Symbol("AUTH_CONTRACT");
export interface IAuthContract {
  getUserById(userId: string): Promise<UserDTO>;
  getRolesForUser(userId: string): Promise<string[]>;
}
```

AuthModule provides:

```ts
@Module({
  providers: [
    { provide: AUTH_CONTRACT, useClass: AuthContractService }
  ],
  exports: [AUTH_CONTRACT]
})
```

WorkflowExecution consumes:

```ts
constructor(@Inject(AUTH_CONTRACT) private auth: IAuthContract) {}
```

#### Pattern 3 — Shadow Read Model (Event-Driven)

**When to use it**

- When you need to query across data owned by multiple modules.

**Example:**

- WorkflowExecution needs to query workflows filtered by tenant plan and user role.

**Wrong approach**

- Cross-module SQL joins.

**Correct approach**

- Create a denormalized read model (table or cache) updated by events.

- Auth publishes:
  - UserRoleChangedEvent

- Tenant publishes:
  - TenantPlanChangedEvent

- WorkflowExecution subscribes and maintains:
  - workflow_execution_user_tenant_view

**Key Rule:**

- Cross-module queries must be solved with shadow/read models or composition at API gateway level — not DB joins.

<!-- SECTION 1 END HERE -->

### Section 2: Contract-First Module Boundaries (Hard Rules)

<!-- SECTION 2 BEGIN HERE -->

Hard Rules for Module Boundaries (Non-Negotiable)

1. No module may import another module’s Entities, Repositories, or TypeORM migrations.
   - If you do this, you have failed microservice extractability.

2. All cross-module calls must go through:
   - a contract interface (synchronous), OR
   - an event contract (async).

3. Each module owns its database tables.
   - Other modules may store foreign keys as UUID strings but cannot join or reference via ORM relations.

4. No shared “common database” module.
   - Shared code is allowed only in libs/shared (pure utilities, decorators, DTOs).

5. REST controllers should not call repositories directly.
   - Controllers call application services.
   - Application services orchestrate repositories and publishers.

6. Use CQRS where appropriate:
   - Commands mutate state.
   - Queries read.
   - Do not mix.

7. Events are the integration backbone.
   - Publish domain events after commits.
   - Consumers must be idempotent.

<!-- SECTION 2 END HERE -->

### Section 3: CQRS (Command/Query Separation) — When and Why

<!-- SECTION 3 BEGIN HERE -->

CQRS — The Right Level of Separation

Do NOT implement CQRS as “two microservices.”
In this architecture, CQRS means:

- separate methods / services for read vs write
- optional separate read models (shadow tables) for complex queries

When to use CQRS:

- Write path has complex invariants (workflow transitions)
- Read path needs denormalized views (dashboard, reporting)
- You anticipate microservice extraction

When NOT to use CQRS:

- Simple CRUD modules with low complexity
- Low-scale internal admin views

Rule of thumb:
If a feature’s read model would benefit from joins across modules, build a shadow read model driven by events.

<!-- SECTION 3 END HERE -->

### Section 4: Multi-Tenancy & Tenant Isolation (RLS)

<!-- SECTION 4 BEGIN HERE -->

Multi-Tenancy Strategy — Shared DB, Shared Schema, Strong Isolation

We use PostgreSQL Row-Level Security (RLS) to enforce tenant isolation at the database level.

Key properties:

- Every tenant-scoped table includes tenant_id (uuid).
- Every query runs with a session variable app.tenant_id set.
- RLS policies filter rows by tenant_id = current_setting('app.tenant_id')::uuid
- FORCE ROW LEVEL SECURITY is enabled to avoid accidental bypass.

Why RLS:

- Defense in depth: even if application code has a bug, the DB blocks cross-tenant reads/writes.
- Easier microservice extraction: each service can keep the same isolation model.

<!-- SECTION 4 END HERE -->

### Section 5: Idempotency & Exactly-Once Effects (Practical)

<!-- SECTION 5 BEGIN HERE -->

Idempotency — How to Build Retry-Safe APIs

Problem:
Clients retry requests due to network failures.
If the server performs the same mutation twice, you get duplicate side effects.

Required pattern:

- For critical commands (like workflow transition execution), accept an idempotency key.
- Store the key with the resulting outcome.
- On retry with the same key, return the stored outcome instead of re-executing.

Consumer rule:
All event consumers must be idempotent too:

- store processed event IDs
- ignore duplicates

<!-- SECTION 5 END HERE -->

### Section 6: Eventing Rules (NATS) — Publishing and Consuming

<!-- SECTION 6 BEGIN HERE -->

Eventing Rules (NATS) — Non-Negotiable

1. Publish events only after DB commit.
2. Event payloads must be versioned.
3. Consumers must:
   - validate schema
   - be idempotent
   - avoid side effects on duplicates
4. No request/response over NATS for synchronous queries.
   - Use contract interfaces for sync calls.

<!-- SECTION 6 END HERE -->

### Section 7: Workflow Definition Versioning & Snapshots

<!-- SECTION 7 BEGIN HERE -->

Workflow Versioning — Immutable Runtime Snapshots

Publishing a workflow creates a versioned snapshot:

- workflow_definition_versions table stores the immutable JSON snapshot
- runtime instances reference a specific published version

Rules:

- Draft definitions are mutable.
- Published versions are immutable.
- Transition execution MUST use the snapshot, not the draft.

Why:

- Reproducibility: you can replay audits and understand what rules applied at the time.
- Safety: edits to drafts can’t break running instances.

<!-- SECTION 7 END HERE -->

### Section 8: Database Design Rules

<!-- SECTION 8 BEGIN HERE -->

Database Design Rules (Microservice Extractable)

1. No cross-module ORM relations.
   - Use UUID foreign keys as plain strings.

2. Each module owns its tables.

3. JSONB is allowed for snapshots and flexible metadata.
   - Do not abuse JSONB for everything.

4. Use optimistic locking where concurrent writes are possible.
   - workflow_instances has a version column.

5. Audit logs are append-only.
   - Never update audit rows.

<!-- SECTION 8 END HERE -->

### Section 9: API Design Rules

<!-- SECTION 9 BEGIN HERE -->

API Design Rules (Contract-First)

1. Every endpoint lives under /api/v1.

2. Prefer explicit resources:
   - /workflow-definitions/:id/states
   - /workflow-definitions/:id/transitions

3. Use DTO validation.

4. Errors must be consistent:
   - never leak internal stack traces
   - map domain errors to HTTP status codes

5. Use idempotency keys for critical commands.

6. Avoid breaking changes:
   - add fields, don’t rename/remove
   - version if unavoidable

<!-- SECTION 9 END HERE -->

### Section 10: Frontend Data Fetching & Caching Rules

<!-- SECTION 10 BEGIN HERE -->

Frontend Data Fetching Rules (TanStack Query)

1. Server state belongs in TanStack Query.
2. Client state (auth session, UI state) belongs in Zustand.
3. Use stable query keys:
   - ['workflowDefinitions', page, limit]
   - ['workflowInstance', instanceId]
4. Prefer cache invalidation over manual refetch.
5. Handle token refresh centrally in the API client.

<!-- SECTION 10 END HERE -->

### Section 11: Error Handling Rules

<!-- SECTION 11 BEGIN HERE -->

Error Handling Rules

1. Use a global exception filter.
2. Standardize error responses.
3. Domain errors map to HTTP errors:
   - ValidationError -> 400
   - UnauthorizedError -> 401
   - ForbiddenError -> 403
   - NotFoundError -> 404
   - ConflictError (optimistic lock) -> 409
4. Never leak internal errors to clients.

<!-- SECTION 11 END HERE -->

### Section 12: Security Baselines

<!-- SECTION 12 BEGIN HERE -->

Security Baselines (API)

1. JWT access tokens for auth.
2. Argon2 for password hashing.
3. Helmet for security headers.
4. XSS sanitization for untrusted inputs.
5. HPP protection.
6. CSRF protection for browser clients where applicable.
7. RLS as defense-in-depth for tenant isolation.

<!-- SECTION 12 END HERE -->
