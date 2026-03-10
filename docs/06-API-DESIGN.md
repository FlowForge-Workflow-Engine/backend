---
title: API Design Documentation
version: 1.0.0
status: Draft
project: Multi-Tenant Workflow Engine — SaaS Platform
architecture: Microservice-Extractable Contract-First Modular Monolith
last_updated: 2026-03-10
author: Debi Prasad Mishra
---

# API Design Documentation

## Table of Contents

- [1. Overview](#1-overview)
  - [1.1 API Style (REST)](#11-api-style-rest)
  - [1.2 Base URL & Versioning Strategy](#12-base-url--versioning-strategy)
  - [1.3 Authentication Model (JWT)](#13-authentication-model-jwt)
  - [1.4 Tenant Context in API](#14-tenant-context-in-api)
- [2. Authentication & Authorization](#2-authentication--authorization)
  - [2.1 JWT Structure (claims, expiry)](#21-jwt-structure-claims-expiry)
  - [2.2 Refresh Token Strategy](#22-refresh-token-strategy)
  - [2.3 API Key Authentication (if applicable)](#23-api-key-authentication-if-applicable)
  - [2.4 Role-Based Access Control (RBAC) Model](#24-role-based-access-control-rbac-model)
- [3. Endpoint Catalogue](#3-endpoint-catalogue)
  - [Auth Endpoints](#auth-endpoints)
  - [Users Endpoints](#users-endpoints)
  - [Roles Endpoints](#roles-endpoints)
  - [Tenants Endpoints](#tenants-endpoints)
  - [Notification Templates Endpoints](#notification-templates-endpoints)
  - [Webhook Configurations Endpoints](#webhook-configurations-endpoints)
  - [Dashboard Endpoints](#dashboard-endpoints)
  - [Workflow Definitions Endpoints](#workflow-definitions-endpoints)
  - [Workflow States Endpoints](#workflow-states-endpoints)
  - [Workflow Transitions Endpoints](#workflow-transitions-endpoints)
  - [Workflow Instances Endpoints](#workflow-instances-endpoints)
  - [Workflow Rules Endpoints](#workflow-rules-endpoints)
  - [Audit Logs Endpoints](#audit-logs-endpoints)
  - [Health Endpoints](#health-endpoints)
- [4. Request/Response Conventions](#4-requestresponse-conventions)
  - [4.1 Standard Response Envelope (if used)](#41-standard-response-envelope-if-used)
  - [4.2 Pagination Convention](#42-pagination-convention)
  - [4.3 Filtering & Sorting Convention](#43-filtering--sorting-convention)
  - [4.4 Date/Time Format](#44-datetime-format)
  - [4.5 ID Format (UUID vs integer)](#45-id-format-uuid-vs-integer)
- [5. Error Handling](#5-error-handling)
  - [5.1 Error Response Schema](#51-error-response-schema)
  - [5.2 HTTP Status Code Usage Table](#52-http-status-code-usage-table)
  - [5.3 Domain Error Code Catalogue](#53-domain-error-code-catalogue)
- [6. Rate Limiting](#6-rate-limiting)
  - [6.1 Rate Limit Headers](#61-rate-limit-headers)
  - [6.2 Per-Tenant Limits](#62-per-tenant-limits)
  - [6.3 Rate Limit Exceeded Response](#63-rate-limit-exceeded-response)
- [7. Versioning Strategy](#7-versioning-strategy)
  - [7.1 Current Version](#71-current-version)
  - [7.2 Deprecation Policy](#72-deprecation-policy)
- [8. Webhooks (if applicable)](#8-webhooks-if-applicable)
  - [8.1 Webhook Event Catalogue](#81-webhook-event-catalogue)
  - [8.2 Payload Schema](#82-payload-schema)
  - [8.3 Retry Strategy](#83-retry-strategy)
- [Appendix A: Full OpenAPI Specification](#appendix-a-full-openapi-specification)

## 1. Overview

### 1.1 API Style (REST)

The backend exposes a JSON-over-HTTP REST API described by `backend/OPEN_API_SPEC.json`. The contract is resource-oriented and uses standard HTTP verbs:

- `GET` for reads
- `POST` for creation/commands
- `PUT` / `PATCH` for updates
- `DELETE` for removals/deactivation-style actions

The surface is grouped by domain resource tags such as Auth, Users, Tenants, Workflow Definitions, Workflow Instances, Notifications, and Health.

### 1.2 Base URL & Versioning Strategy

The NestJS application configures:

- global prefix: `/api`
- URI versioning: `v1`

Effective public REST base path:

- `/api/v1`

All endpoints listed in the OpenAPI contract already include this versioned base path.

### 1.3 Authentication Model (JWT)

The API uses JWT bearer authentication for protected routes.

- `JwtAuthGuard` is registered globally.
- Swagger/OpenAPI marks protected operations with bearer auth security.
- Public endpoints use the custom `@Public()` decorator.
- Browser flows also expose `GET /api/v1/csrf-token` because the runtime includes CSRF middleware in addition to JWT auth.

### 1.4 Tenant Context in API

Tenant context is first-class in the API design.

- JWT claims include `tenantId` and `tenantSlug`.
- `TenantIsolationGuard` runs globally after JWT validation.
- Controllers commonly derive tenant scope from authenticated context via `@TenantId()` instead of trusting arbitrary client-supplied tenant identifiers.
- The design aligns with the codebase's tenant isolation model and RLS-oriented data access patterns.

## 2. Authentication & Authorization

### 2.1 JWT Structure (claims, expiry)

The shared JWT payload interface contains the following claims:

| Claim        | Meaning             |
| ------------ | ------------------- |
| `sub`        | User UUID           |
| `email`      | User email          |
| `tenantId`   | Tenant UUID         |
| `tenantSlug` | Tenant slug         |
| `roles`      | Assigned role names |
| `roleIds`    | Assigned role IDs   |
| `plan`       | Tenant plan         |
| `firstName`  | User first name     |

Access-token expiry is **configuration-driven** through `JWT_EXPIRES_IN`.

Important implementation nuance:

- module fallback code uses `15m`
- environment validation/setup documentation uses `24h`

The safest source-backed statement is therefore: **the access token lifetime is configurable, not hardcoded to a single universal value.**

### 2.2 Refresh Token Strategy

Refresh token handling is more conservative than a simple long-lived JWT refresh model.

- Refresh tokens are **opaque UUID-style tokens**, not JWTs.
- `POST /api/v1/auth/refresh` is public and accepts a refresh-token payload.
- Refresh tokens are **rotated** on use.
- Used tokens are revoked as part of rotation.
- Persisted storage uses a **SHA-256 hash** of the token rather than the raw token value.
- Expiry is configuration-driven via `JWT_REFRESH_EXPIRY_DAYS`.
- `POST /api/v1/auth/logout` revokes the active/current refresh session and returns `204 No Content`.

### 2.3 API Key Authentication (if applicable)

No API-key authentication mechanism is documented in the inspected runtime or in `backend/OPEN_API_SPEC.json`.

Current conclusion:

- **API key auth is not implemented / not part of the published HTTP contract.**

### 2.4 Role-Based Access Control (RBAC) Model

Authorization is enforced through a global guard chain:

1. `ThrottlerGuard`
2. `JwtAuthGuard`
3. `TenantIsolationGuard`
4. `RolesGuard`

Observed RBAC behavior:

- `@Public()` bypasses JWT/RBAC for explicitly public routes.
- If a protected route has **no** `@Roles(...)` metadata, `RolesGuard` allows any authenticated user.
- Only routes with explicit `@Roles(...)` annotations should be documented as role-restricted.

Explicitly confirmed `ADMIN`-restricted operations include:

- `DELETE /api/v1/users/{id}`
- `POST /api/v1/users/{id}/roles`
- `POST /api/v1/roles`
- `PATCH /api/v1/tenants/{id}`
- `DELETE /api/v1/tenants/{id}`
- `PATCH /api/v1/tenants/{id}/settings`
- `POST /api/v1/tenants/{id}/feature-flags`
- `PATCH /api/v1/tenants/{id}/feature-flags/{key}`
- `DELETE /api/v1/tenants/{id}/feature-flags/{key}`

Nuance worth preserving in the documentation:

- `GET /api/v1/tenants` has the Swagger summary text **"List all tenants (super-admin)"**.
- In the inspected controller, an explicit `@Roles(...)` decorator was **not** confirmed on that route.
- The endpoint table below therefore stays conservative and does not overstate enforced RBAC beyond source-backed evidence.

## 3. Endpoint Catalogue

Endpoint groups below are sourced from `backend/OPEN_API_SPEC.json`, with role notes cross-checked against inspected controller decorators.

### Auth Endpoints

| Method | Path                           | Auth Required | Role               | Description                                              |
| ------ | ------------------------------ | ------------- | ------------------ | -------------------------------------------------------- |
| POST   | `/api/v1/auth/register/tenant` | No            | Public             | Register a new company (tenant) and its first admin user |
| POST   | `/api/v1/auth/register`        | No            | Public             | Self-register as an employee of an existing company      |
| POST   | `/api/v1/auth/login`           | No            | Public             | Authenticate and receive token pair                      |
| POST   | `/api/v1/auth/refresh`         | No            | Public             | Rotate refresh token and receive a new token pair        |
| GET    | `/api/v1/auth/me`              | Yes           | Authenticated user | Return current logged-in user                            |
| POST   | `/api/v1/auth/logout`          | Yes           | Authenticated user | Revoke the current refresh token                         |
| GET    | `/api/v1/csrf-token`           | No            | Public             | Issue a CSRF token for cross-site browser requests       |

#### Detailed endpoint entries with request/response schemas

| Method | Path                           | Request schema                                                                    | Success response schema                                                                                                   |
| ------ | ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/register/tenant` | Tenant onboarding payload containing tenant details plus founding admin user data | `201` success envelope with onboarding result and authentication/token context                                            |
| POST   | `/api/v1/auth/register`        | Employee self-registration payload for joining an existing tenant/company         | `201` success envelope with created user record                                                                           |
| POST   | `/api/v1/auth/login`           | Credentials payload (`email` + password-style login input)                        | `200` success envelope returning token pair and authenticated user context                                                |
| POST   | `/api/v1/auth/refresh`         | Refresh-token payload containing the opaque refresh token                         | `200` success envelope returning rotated token pair                                                                       |
| GET    | `/api/v1/auth/me`              | No body; bearer token required                                                    | `200` success envelope containing the current authenticated user profile and tenant context                               |
| POST   | `/api/v1/auth/logout`          | Authenticated revocation request for the current refresh session                  | `204 No Content`                                                                                                          |
| GET    | `/api/v1/csrf-token`           | No body                                                                           | `200` success envelope containing a freshly issued CSRF token; response is marked `no-store`/`no-cache` in the controller |

### Users Endpoints

| Method | Path                       | Auth Required | Role               | Description                                      |
| ------ | -------------------------- | ------------- | ------------------ | ------------------------------------------------ |
| GET    | `/api/v1/users`            | Yes           | Authenticated user | List all users within the authenticated tenant   |
| POST   | `/api/v1/users`            | Yes           | Authenticated user | Create a user within the authenticated tenant    |
| GET    | `/api/v1/users/{id}`       | Yes           | Authenticated user | Get a user by ID within the authenticated tenant |
| DELETE | `/api/v1/users/{id}`       | Yes           | Admin              | Deactivate a user                                |
| POST   | `/api/v1/users/{id}/roles` | Yes           | Admin              | Assign a role to a user                          |

#### Detailed endpoint entries with request/response schemas

| Method | Path                       | Request schema                                                         | Success response schema                                        |
| ------ | -------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| GET    | `/api/v1/users`            | No body; tenant scope comes from JWT                                   | `200` count envelope containing tenant-scoped user records     |
| POST   | `/api/v1/users`            | User-creation DTO with user profile + credentials/role assignment data | `201` success envelope containing the created user             |
| GET    | `/api/v1/users/{id}`       | Path param `id` as UUID                                                | `200` success envelope with a single tenant-scoped user record |
| DELETE | `/api/v1/users/{id}`       | Path param `id` as UUID                                                | `204 No Content` after deactivation                            |
| POST   | `/api/v1/users/{id}/roles` | Role-assignment DTO targeting a tenant user and role                   | `200` message/success envelope confirming role assignment      |

### Roles Endpoints

| Method | Path            | Auth Required | Role               | Description                                          |
| ------ | --------------- | ------------- | ------------------ | ---------------------------------------------------- |
| GET    | `/api/v1/roles` | Yes           | Authenticated user | List all roles within the authenticated tenant       |
| POST   | `/api/v1/roles` | Yes           | Admin              | Create a custom role within the authenticated tenant |

#### Detailed endpoint entries with request/response schemas

| Method | Path            | Request schema                                    | Success response schema                            |
| ------ | --------------- | ------------------------------------------------- | -------------------------------------------------- |
| GET    | `/api/v1/roles` | No body; tenant scope from JWT                    | `200` count envelope containing role definitions   |
| POST   | `/api/v1/roles` | Role-creation DTO for a tenant-scoped custom role | `201` success envelope containing the created role |

### Tenants Endpoints

| Method | Path                                       | Auth Required | Role                                                       | Description                                |
| ------ | ------------------------------------------ | ------------- | ---------------------------------------------------------- | ------------------------------------------ |
| GET    | `/api/v1/tenants`                          | Yes           | Authenticated user (Swagger summary labels it super-admin) | List all tenants                           |
| GET    | `/api/v1/tenants/{id}`                     | Yes           | Authenticated user                                         | Get tenant by ID                           |
| PATCH  | `/api/v1/tenants/{id}`                     | Yes           | Admin                                                      | Update tenant name, plan, or active status |
| DELETE | `/api/v1/tenants/{id}`                     | Yes           | Admin                                                      | Deactivate a tenant                        |
| GET    | `/api/v1/tenants/{id}/settings`            | Yes           | Authenticated user                                         | Get settings for a tenant                  |
| PATCH  | `/api/v1/tenants/{id}/settings`            | Yes           | Admin                                                      | Update settings for a tenant               |
| GET    | `/api/v1/tenants/{id}/feature-flags`       | Yes           | Authenticated user                                         | List all feature flags for a tenant        |
| POST   | `/api/v1/tenants/{id}/feature-flags`       | Yes           | Admin                                                      | Create a feature flag for a tenant         |
| PATCH  | `/api/v1/tenants/{id}/feature-flags/{key}` | Yes           | Admin                                                      | Update a feature flag                      |
| DELETE | `/api/v1/tenants/{id}/feature-flags/{key}` | Yes           | Admin                                                      | Delete a feature flag                      |

#### Detailed endpoint entries with request/response schemas

| Method | Path                                       | Request schema                                            | Success response schema                             |
| ------ | ------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------- |
| GET    | `/api/v1/tenants`                          | No body                                                   | `200` count envelope of tenant summaries            |
| GET    | `/api/v1/tenants/{id}`                     | Path param `id` as UUID                                   | `200` success envelope with tenant details          |
| PATCH  | `/api/v1/tenants/{id}`                     | Partial tenant-update DTO (`name`, `plan`, active status) | `200` success envelope with updated tenant          |
| DELETE | `/api/v1/tenants/{id}`                     | Path param `id` as UUID                                   | `204 No Content` after deactivation                 |
| GET    | `/api/v1/tenants/{id}/settings`            | Path param `id` as UUID                                   | `200` success envelope with tenant settings         |
| PATCH  | `/api/v1/tenants/{id}/settings`            | Tenant-settings update DTO                                | `200` success envelope with updated tenant settings |
| GET    | `/api/v1/tenants/{id}/feature-flags`       | Path param `id` as UUID                                   | `200` count envelope with tenant feature flags      |
| POST   | `/api/v1/tenants/{id}/feature-flags`       | Feature-flag creation DTO                                 | `201` success envelope with created feature flag    |
| PATCH  | `/api/v1/tenants/{id}/feature-flags/{key}` | Feature-flag update DTO keyed by path parameter `key`     | `200` success envelope with updated feature flag    |
| DELETE | `/api/v1/tenants/{id}/feature-flags/{key}` | Path params `id` + `key`                                  | `204 No Content`                                    |

### Notification Templates Endpoints

| Method | Path                                  | Auth Required | Role               | Description                                    |
| ------ | ------------------------------------- | ------------- | ------------------ | ---------------------------------------------- |
| GET    | `/api/v1/notification-templates`      | Yes           | Authenticated user | List all notification templates for the tenant |
| POST   | `/api/v1/notification-templates`      | Yes           | Authenticated user | Create a notification template                 |
| GET    | `/api/v1/notification-templates/{id}` | Yes           | Authenticated user | Get a notification template by ID              |
| PUT    | `/api/v1/notification-templates/{id}` | Yes           | Authenticated user | Update a notification template                 |
| DELETE | `/api/v1/notification-templates/{id}` | Yes           | Authenticated user | Delete a notification template                 |

#### Detailed endpoint entries with request/response schemas

| Method | Path                                  | Request schema                                                                                      | Success response schema                                       |
| ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| GET    | `/api/v1/notification-templates`      | No body; tenant context from JWT; query parameters may include pagination/resource filters per spec | `200` count envelope containing notification template records |
| POST   | `/api/v1/notification-templates`      | Notification-template creation DTO for channel, trigger, subject/body/template content              | `201` success envelope with created notification template     |
| GET    | `/api/v1/notification-templates/{id}` | Path param `id` as UUID                                                                             | `200` success envelope with detailed notification template    |
| PUT    | `/api/v1/notification-templates/{id}` | Partial/full notification-template update DTO                                                       | `200` success envelope with updated notification template     |
| DELETE | `/api/v1/notification-templates/{id}` | Path param `id` as UUID                                                                             | `204 No Content`                                              |

### Webhook Configurations Endpoints

| Method | Path                           | Auth Required | Role               | Description                                    |
| ------ | ------------------------------ | ------------- | ------------------ | ---------------------------------------------- |
| GET    | `/api/v1/webhook-configs`      | Yes           | Authenticated user | List all webhook configurations for the tenant |
| POST   | `/api/v1/webhook-configs`      | Yes           | Authenticated user | Register a new webhook configuration           |
| GET    | `/api/v1/webhook-configs/{id}` | Yes           | Authenticated user | Get a webhook configuration by ID              |
| PUT    | `/api/v1/webhook-configs/{id}` | Yes           | Authenticated user | Update a webhook configuration                 |
| DELETE | `/api/v1/webhook-configs/{id}` | Yes           | Authenticated user | Delete a webhook configuration                 |

#### Detailed endpoint entries with request/response schemas

| Method | Path                           | Request schema                                                                              | Success response schema                                       |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| GET    | `/api/v1/webhook-configs`      | No body; tenant context from JWT                                                            | `200` count envelope containing webhook configuration records |
| POST   | `/api/v1/webhook-configs`      | `CreateWebhookConfigDto` with `name`, `url`, `secret`, `eventTriggers`, optional `isActive` | `201` success envelope with created webhook configuration     |
| GET    | `/api/v1/webhook-configs/{id}` | Path param `id` as UUID                                                                     | `200` success envelope with detailed webhook configuration    |
| PUT    | `/api/v1/webhook-configs/{id}` | Webhook configuration update payload using the same resource shape as create/update DTOs    | `200` success envelope with updated webhook configuration     |
| DELETE | `/api/v1/webhook-configs/{id}` | Path param `id` as UUID                                                                     | `204 No Content`                                              |

### Dashboard Endpoints

| Method | Path                      | Auth Required | Role               | Description                     |
| ------ | ------------------------- | ------------- | ------------------ | ------------------------------- |
| GET    | `/api/v1/dashboard/stats` | Yes           | Authenticated user | Get tenant dashboard statistics |

#### Detailed endpoint entries with request/response schemas

| Method | Path                      | Request schema                 | Success response schema                                                               |
| ------ | ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| GET    | `/api/v1/dashboard/stats` | No body; tenant scope from JWT | `200` success envelope with dashboard aggregates such as tenant/user/workflow metrics |

### Workflow Definitions Endpoints

| Method | Path                                                         | Auth Required | Role               | Description                                                            |
| ------ | ------------------------------------------------------------ | ------------- | ------------------ | ---------------------------------------------------------------------- |
| GET    | `/api/v1/workflow-definitions`                               | Yes           | Authenticated user | List all workflow definitions for the tenant                           |
| POST   | `/api/v1/workflow-definitions`                               | Yes           | Authenticated user | Create a new workflow definition (draft)                               |
| GET    | `/api/v1/workflow-definitions/{id}`                          | Yes           | Authenticated user | Get a workflow definition by ID                                        |
| DELETE | `/api/v1/workflow-definitions/{id}`                          | Yes           | Authenticated user | Delete a draft workflow definition                                     |
| POST   | `/api/v1/workflow-definitions/{id}/publish`                  | Yes           | Authenticated user | Publish a workflow definition and create an immutable version snapshot |
| POST   | `/api/v1/workflow-definitions/{id}/deprecate`                | Yes           | Authenticated user | Deprecate a published workflow definition                              |
| GET    | `/api/v1/workflow-definitions/{id}/instance-form-schema`     | Yes           | Authenticated user | Get the client-facing instance form schema for a workflow definition   |
| GET    | `/api/v1/workflow-definitions/{id}/versions`                 | Yes           | Authenticated user | Get workflow definition basic info with all published versions         |
| GET    | `/api/v1/workflow-definitions/{id}/versions/{versionNumber}` | Yes           | Authenticated user | Get immutable workflow definition version details by version number    |

#### Detailed endpoint entries with request/response schemas

| Method | Path                                                         | Request schema                                                                            | Success response schema                                                             |
| ------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/v1/workflow-definitions`                               | No body; tenant scope from JWT                                                            | `200` count envelope of workflow definition summaries                               |
| POST   | `/api/v1/workflow-definitions`                               | Workflow-definition draft creation DTO                                                    | `201` success envelope containing the created draft definition                      |
| GET    | `/api/v1/workflow-definitions/{id}`                          | Path param `id` as UUID                                                                   | `200` success envelope with workflow definition details                             |
| DELETE | `/api/v1/workflow-definitions/{id}`                          | Path param `id` as UUID; valid only for draft lifecycle state                             | `204 No Content`                                                                    |
| POST   | `/api/v1/workflow-definitions/{id}/publish`                  | Command-style publish request; no complex request body required by the published contract | `200` message/success envelope confirming publication and version snapshot creation |
| POST   | `/api/v1/workflow-definitions/{id}/deprecate`                | Command-style deprecate request against a published definition                            | `200` message/success envelope confirming deprecation                               |
| GET    | `/api/v1/workflow-definitions/{id}/instance-form-schema`     | Path param `id` as UUID                                                                   | `200` success envelope containing the frontend-facing form schema                   |
| GET    | `/api/v1/workflow-definitions/{id}/versions`                 | Path param `id` as UUID                                                                   | `200` success envelope with definition metadata plus published version list         |
| GET    | `/api/v1/workflow-definitions/{id}/versions/{versionNumber}` | Path param `id` as UUID plus version number                                               | `200` success envelope with immutable version snapshot details                      |

### Workflow States Endpoints

| Method | Path                                                 | Auth Required | Role               | Description                                            |
| ------ | ---------------------------------------------------- | ------------- | ------------------ | ------------------------------------------------------ |
| GET    | `/api/v1/workflow-definitions/{id}/states`           | Yes           | Authenticated user | List all states for a workflow definition              |
| POST   | `/api/v1/workflow-definitions/{id}/states`           | Yes           | Authenticated user | Add a state to a draft workflow definition             |
| GET    | `/api/v1/workflow-definitions/{id}/states/{stateId}` | Yes           | Authenticated user | Get a specific state by ID                             |
| PATCH  | `/api/v1/workflow-definitions/{id}/states/{stateId}` | Yes           | Authenticated user | Update a workflow state in a draft workflow definition |
| DELETE | `/api/v1/workflow-definitions/{id}/states/{stateId}` | Yes           | Authenticated user | Remove a state from a draft workflow definition        |

#### Detailed endpoint entries with request/response schemas

| Method | Path                                                 | Request schema                            | Success response schema                             |
| ------ | ---------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| GET    | `/api/v1/workflow-definitions/{id}/states`           | Path param `id` as UUID                   | `200` count envelope containing state records       |
| POST   | `/api/v1/workflow-definitions/{id}/states`           | State-creation DTO for a draft definition | `201` success envelope with created state           |
| GET    | `/api/v1/workflow-definitions/{id}/states/{stateId}` | Path params `id` + `stateId`              | `200` success envelope with a single workflow state |
| PATCH  | `/api/v1/workflow-definitions/{id}/states/{stateId}` | Partial state-update DTO                  | `200` success envelope with updated state           |
| DELETE | `/api/v1/workflow-definitions/{id}/states/{stateId}` | Path params `id` + `stateId`              | `204 No Content`                                    |

### Workflow Transitions Endpoints

| Method | Path                                                                          | Auth Required | Role               | Description                                     |
| ------ | ----------------------------------------------------------------------------- | ------------- | ------------------ | ----------------------------------------------- |
| GET    | `/api/v1/workflow-definitions/{id}/transitions`                               | Yes           | Authenticated user | List all transitions for a workflow definition  |
| POST   | `/api/v1/workflow-definitions/{id}/transitions`                               | Yes           | Authenticated user | Add a transition to a draft workflow definition |
| GET    | `/api/v1/workflow-definitions/{id}/transitions/{transitionId}`                | Yes           | Authenticated user | Get a specific transition by ID                 |
| DELETE | `/api/v1/workflow-definitions/{id}/transitions/{transitionId}`                | Yes           | Authenticated user | Remove a transition and its rules               |
| GET    | `/api/v1/workflow-definitions/{id}/transitions/{transitionId}/rules`          | Yes           | Authenticated user | List all rules of a workflow transition         |
| POST   | `/api/v1/workflow-definitions/{id}/transitions/{transitionId}/rules`          | Yes           | Authenticated user | Attach a rule to a workflow transition          |
| DELETE | `/api/v1/workflow-definitions/{id}/transitions/{transitionId}/rules/{ruleId}` | Yes           | Authenticated user | Remove a rule from a draft workflow transition  |

#### Detailed endpoint entries with request/response schemas

| Method | Path                                                                          | Request schema                                 | Success response schema                            |
| ------ | ----------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| GET    | `/api/v1/workflow-definitions/{id}/transitions`                               | Path param `id` as UUID                        | `200` count envelope containing transition records |
| POST   | `/api/v1/workflow-definitions/{id}/transitions`                               | Transition-creation DTO for a draft definition | `201` success envelope with created transition     |
| GET    | `/api/v1/workflow-definitions/{id}/transitions/{transitionId}`                | Path params `id` + `transitionId`              | `200` success envelope with a single transition    |
| DELETE | `/api/v1/workflow-definitions/{id}/transitions/{transitionId}`                | Path params `id` + `transitionId`              | `204 No Content`                                   |
| GET    | `/api/v1/workflow-definitions/{id}/transitions/{transitionId}/rules`          | Path params `id` + `transitionId`              | `200` count envelope containing rule bindings      |
| POST   | `/api/v1/workflow-definitions/{id}/transitions/{transitionId}/rules`          | Transition-rule attach DTO                     | `201` success envelope with created rule binding   |
| DELETE | `/api/v1/workflow-definitions/{id}/transitions/{transitionId}/rules/{ruleId}` | Path params `id` + `transitionId` + `ruleId`   | `204 No Content`                                   |

### Workflow Instances Endpoints

| Method | Path                                                  | Auth Required | Role               | Description                                                      |
| ------ | ----------------------------------------------------- | ------------- | ------------------ | ---------------------------------------------------------------- |
| GET    | `/api/v1/workflow-instances`                          | Yes           | Authenticated user | List workflow instances (paginated)                              |
| POST   | `/api/v1/workflow-instances`                          | Yes           | Authenticated user | Create a new workflow instance                                   |
| GET    | `/api/v1/workflow-instances/{id}`                     | Yes           | Authenticated user | Get workflow instance details                                    |
| GET    | `/api/v1/workflow-instances/{id}/allowed-transitions` | Yes           | Authenticated user | List transitions available to the current user for this instance |
| POST   | `/api/v1/workflow-instances/{id}/transitions`         | Yes           | Authenticated user | Execute a transition on a workflow instance                      |
| POST   | `/api/v1/workflow-instances/{id}/cancel`              | Yes           | Authenticated user | Cancel an active workflow instance                               |

#### Detailed endpoint entries with request/response schemas

| Method | Path                                                  | Request schema                                                                                    | Success response schema                                                            |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/api/v1/workflow-instances`                          | Pagination query params (`page`, `limit`) plus resource-specific filters from the contract        | `200` count envelope containing workflow instance summaries                        |
| POST   | `/api/v1/workflow-instances`                          | Workflow-instance creation DTO with definition/version selection and runtime form/context data    | `201` success envelope containing the created instance                             |
| GET    | `/api/v1/workflow-instances/{id}`                     | Path param `id` as UUID                                                                           | `200` success envelope with workflow instance details                              |
| GET    | `/api/v1/workflow-instances/{id}/allowed-transitions` | Path param `id` as UUID                                                                           | `200` count envelope of transitions currently executable by the authenticated user |
| POST   | `/api/v1/workflow-instances/{id}/transitions`         | Transition-execution command DTO including target transition and runtime metadata/comment/context | `200` success envelope with transition result and updated workflow instance state  |
| POST   | `/api/v1/workflow-instances/{id}/cancel`              | Cancellation command DTO for an active instance                                                   | `200` message/success envelope confirming cancellation                             |

### Workflow Rules Endpoints

| Method | Path                              | Auth Required | Role               | Description                                                  |
| ------ | --------------------------------- | ------------- | ------------------ | ------------------------------------------------------------ |
| GET    | `/api/v1/workflow-rules/metadata` | Yes           | Authenticated user | Get fixed rule-authoring metadata for frontend rule builders |

#### Detailed endpoint entries with request/response schemas

| Method | Path                              | Request schema | Success response schema                                                                  |
| ------ | --------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/v1/workflow-rules/metadata` | No body        | `200` success envelope containing static rule metadata used by the frontend rule builder |

### Audit Logs Endpoints

| Method | Path                                         | Auth Required | Role               | Description                                     |
| ------ | -------------------------------------------- | ------------- | ------------------ | ----------------------------------------------- |
| GET    | `/api/v1/workflow-instances/{id}/audit-logs` | Yes           | Authenticated user | Get paginated audit log for a workflow instance |

#### Detailed endpoint entries with request/response schemas

| Method | Path                                         | Request schema                                       | Success response schema                                            |
| ------ | -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/v1/workflow-instances/{id}/audit-logs` | Path param `id` as UUID plus pagination query params | `200` count envelope containing audit-log entries for the instance |

### Health Endpoints

| Method | Path                   | Auth Required | Role   | Description                     |
| ------ | ---------------------- | ------------- | ------ | ------------------------------- |
| GET    | `/api/v1/health`       | No            | Public | Liveness probe: db, redis, nats |
| GET    | `/api/v1/health/ready` | No            | Public | Readiness probe                 |

#### Detailed endpoint entries with request/response schemas

| Method | Path                   | Request schema | Success response schema                                                             |
| ------ | ---------------------- | -------------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/v1/health`       | No body        | `200` health summary when dependencies are healthy; `503` when liveness checks fail |
| GET    | `/api/v1/health/ready` | No body        | `200` readiness summary when the app is ready; `503` when readiness checks fail     |

## 4. Request/Response Conventions

### 4.1 Standard Response Envelope (if used)

The shared DTO layer establishes standard success envelopes:

| Envelope                 | Shape                     | Usage                                 |
| ------------------------ | ------------------------- | ------------------------------------- |
| `ApiResponseDto<T>`      | `{ status, data }`        | Single-resource and command responses |
| `CountApiResponseDto<T>` | `{ status, count, data }` | List responses                        |
| `MessageResponseDto`     | `{ status, message }`     | Command acknowledgements              |

Observed conventions:

- `status` is typically a success indicator.
- `data` carries the resource payload.
- `count` accompanies list-style responses.
- Some endpoints intentionally return `204 No Content` instead of an envelope.

### 4.2 Pagination Convention

The shared pagination DTO defines a common pagination contract:

| Field   | Type   | Rules                                |
| ------- | ------ | ------------------------------------ |
| `page`  | number | Optional, minimum `1`                |
| `limit` | number | Optional, minimum `1`, maximum `100` |

This pagination convention is used by paginated list endpoints such as workflow instances and audit logs.

### 4.3 Filtering & Sorting Convention

No global shared filtering/sorting DTO equivalent to `PaginationDto` was confirmed in the inspected shared layer.

Conservative conclusion:

- pagination is standardized
- filtering and sorting, where present, are **resource-specific** rather than globally normalized
- clients should treat non-pagination query parameters as endpoint-specific contract details sourced from `OPEN_API_SPEC.json`

### 4.4 Date/Time Format

Date/time values are represented as ISO-8601 / RFC-3339-compatible strings in OpenAPI examples and DTO responses, for example:

- `2026-03-01T08:00:00Z`
- `2026-03-05T10:30:00Z`

Entity and DTO examples consistently use timestamp fields such as `createdAt`, `updatedAt`, `occurredAt`, `timestamp`, `sentAt`, and `deliveredAt`.

### 4.5 ID Format (UUID vs integer)

The API predominantly uses UUID identifiers.

Examples include:

- `id`
- `tenantId`
- `userId`
- `definitionId`
- `stateId`
- `transitionId`
- `ruleId`

Path parameter DTOs and Swagger metadata explicitly describe these identifiers as UUIDs.

## 5. Error Handling

### 5.1 Error Response Schema

The active global exception contract is defined by `GlobalExceptionFilter`.

Standard runtime error shape:

```json
{
  "statusCode": 400,
  "errorCode": "WORKFLOW_DEFINITION_NOT_DRAFT",
  "message": "Workflow definition must be in draft state",
  "timestamp": "2026-03-10T10:00:00.000Z",
  "path": "/api/v1/workflow-definitions/..."
}
```

Fields:

| Field        | Meaning                                               |
| ------------ | ----------------------------------------------------- |
| `statusCode` | HTTP status code                                      |
| `errorCode`  | Stable machine-readable domain/application error code |
| `message`    | Human-readable error message                          |
| `timestamp`  | ISO timestamp when the error response was produced    |
| `path`       | Request URL                                           |

Special case:

- invalid CSRF tokens are explicitly mapped to:
  - `403`
  - `errorCode: INVALID_CSRF_TOKEN`
  - `message: Invalid CSRF token`

Important nuance:

- the global exception filter standardizes application/runtime errors
- the rate-limit middleware documents a `429` body shaped as `{ statusCode, message, retryAfter }`
- therefore not every middleware-generated error is guaranteed to include the full `errorCode` field

### 5.2 HTTP Status Code Usage Table

| Status                      | Usage                                                                | Examples                                                                                                 | Source                         |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `200 OK`                    | Successful reads, updates, and command acknowledgements              | login, `me`, dashboard stats, tenant settings reads, workflow reads/commands                             | OpenAPI + controllers          |
| `201 Created`               | Successful create operations                                         | tenant registration, user creation, role creation, workflow definition creation, webhook config creation | OpenAPI                        |
| `204 No Content`            | Successful delete/deactivate/revoke operations with no response body | logout, delete webhook config, delete notification template, delete draft workflow artifacts             | OpenAPI + controllers          |
| `400 Bad Request`           | Validation failures or domain precondition failures                  | malformed DTO input, invalid workflow draft/publish transitions                                          | Runtime behavior + `AppErrors` |
| `401 Unauthorized`          | Missing/invalid/expired JWT                                          | protected route access without valid bearer token                                                        | Global JWT auth model          |
| `403 Forbidden`             | RBAC denial, tenant mismatch, invalid CSRF token                     | `INVALID_CSRF_TOKEN`, forbidden transition role, tenant isolation failures                               | Guards + exception filter      |
| `404 Not Found`             | Requested resource does not exist in tenant scope                    | `USER_NOT_FOUND`, `NOTIFICATION_TEMPLATE_NOT_FOUND`, `WEBHOOK_CONFIG_NOT_FOUND`                          | Controllers + `AppErrors`      |
| `409 Conflict`              | Uniqueness/conflict semantics                                        | `EMAIL_ALREADY_EXISTS`, `TENANT_SLUG_TAKEN`, `TRANSITION_CONFLICT`                                       | Services + `AppErrors`         |
| `429 Too Many Requests`     | Tenant/user rate limit exceeded                                      | organization or user bucket exhausted                                                                    | `TENANT_RATE_LIMITING.md`      |
| `500 Internal Server Error` | Unhandled unexpected server exception                                | uncaught runtime errors normalized by `GlobalExceptionFilter`                                            | Exception filter               |
| `503 Service Unavailable`   | Health/readiness probe failure                                       | `/health`, `/health/ready` unhealthy dependency state                                                    | OpenAPI                        |

Note: the published OpenAPI contract appears to document success responses more exhaustively than error responses. Error behaviors above combine OpenAPI evidence with runtime guard/filter/service inspection.

### 5.3 Domain Error Code Catalogue

Business/domain error codes are centralized in `AppErrors`.

#### Auth errors

- `INVALID_CREDENTIALS`
- `USER_NOT_FOUND`
- `USER_INACTIVE`
- `EMAIL_ALREADY_EXISTS`
- `EMAIL_NOT_VERIFIED`
- `INVALID_REFRESH_TOKEN`
- `REFRESH_TOKEN_EXPIRED`
- `REFRESH_TOKEN_REVOKED`
- `ROLE_NOT_FOUND`
- `ROLE_ALREADY_ASSIGNED`

#### Tenant errors

- `TENANT_NOT_FOUND`
- `TENANT_INACTIVE`
- `TENANT_SLUG_TAKEN`
- `FEATURE_FLAG_NOT_FOUND`
- `MAX_USERS_REACHED`
- `MAX_WORKFLOWS_REACHED`

#### Workflow definition errors

- `WORKFLOW_DEFINITION_NOT_FOUND`
- `WORKFLOW_DEFINITION_NOT_DRAFT`
- `WORKFLOW_DEFINITION_NOT_PUBLISHED`
- `WORKFLOW_DEFINITION_ALREADY_PUBLISHED`
- `WORKFLOW_STATE_NOT_FOUND`
- `WORKFLOW_TRANSITION_NOT_FOUND`
- `WORKFLOW_INITIAL_STATE_REQUIRED`
- `WORKFLOW_MULTIPLE_INITIAL_STATES`
- `TRANSITION_RULE_NOT_FOUND`
- `TRANSITION_RULE_SCHEMA_FIELDS_MISSING`

#### Workflow execution errors

- `WORKFLOW_INSTANCE_NOT_FOUND`
- `WORKFLOW_INSTANCE_NOT_ACTIVE`
- `WORKFLOW_INSTANCE_REQUIRED_FIELDS_MISSING`
- `TRANSITION_NOT_ALLOWED`
- `TRANSITION_ROLE_FORBIDDEN`
- `TRANSITION_RULES_FAILED`
- `TRANSITION_CONFLICT`
- `COMMENT_REQUIRED`
- `IDEMPOTENCY_KEY_REUSED`
- `DEFINITION_VERSION_NOT_FOUND`

#### Audit errors

- `AUDIT_LOG_NOT_FOUND`

#### Notification errors

- `NOTIFICATION_TEMPLATE_NOT_FOUND`
- `WEBHOOK_CONFIG_NOT_FOUND`
- `NOTIFICATION_SEND_FAILED`
- `WEBHOOK_DELIVERY_FAILED`

#### Rule engine errors

- `RULE_EVALUATION_ERROR`
- `RULE_TEMPLATE_NOT_FOUND`

#### Generic errors

- `FORBIDDEN`
- `UNAUTHORIZED`
- `VALIDATION_FAILED`
- `INTERNAL_SERVER_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `TENANT_MISMATCH`

Frontend code already consumes this backend error shape and maps selected `errorCode` values to user-facing messages.

## 6. Rate Limiting

### 6.1 Rate Limit Headers

The enhanced tenant-aware rate limiter exposes the following response headers:

| Header                         | Meaning                                                |
| ------------------------------ | ------------------------------------------------------ |
| `X-RateLimit-Limit`            | Most restrictive active limit (tenant or user)         |
| `X-RateLimit-Remaining`        | Remaining tokens for the most restrictive bucket       |
| `X-RateLimit-Reset`            | Time when the most restrictive bucket regains capacity |
| `X-RateLimit-Tenant-Remaining` | Remaining tokens in the tenant bucket                  |
| `X-RateLimit-User-Remaining`   | Remaining tokens in the user bucket                    |

Illustrative successful response headers from the design doc:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 156
X-RateLimit-Reset: 2024-03-05T12:25:00.000Z
X-RateLimit-Tenant-Remaining: 847
X-RateLimit-User-Remaining: 156
```

### 6.2 Per-Tenant Limits

The system uses an enhanced Redis-backed leaky-bucket model with Lua scripts for atomic updates.

Configured logical limits documented in `backend/TENANT_RATE_LIMITING.md`:

| Scope  | Burst capacity  | Sustained rate |
| ------ | --------------- | -------------- |
| Tenant | `1000` requests | `600/minute`   |
| User   | `200` requests  | `120/minute`   |

Additional behavior:

- unauthenticated requests are skipped by the enhanced middleware and handled by auth guards
- system administrators bypass enhanced rate limits
- health endpoints are excluded from enhanced rate limiting
- if Redis/Lua execution fails, the middleware is **fail-open** and allows traffic through
- the standard Nest `ThrottlerGuard` remains in place as a backup/global protection layer

### 6.3 Rate Limit Exceeded Response

The documented `429` response shape is middleware-oriented and includes `retryAfter`.

Tenant-level example:

```json
{
  "statusCode": 429,
  "message": "Too many requests from your organization",
  "retryAfter": 30
}
```

User-level example:

```json
{
  "statusCode": 429,
  "message": "Too many requests",
  "retryAfter": 15
}
```

This differs slightly from the standard global exception-filter shape because it is emitted by rate-limiting middleware rather than by the shared exception filter.

## 7. Versioning Strategy

### 7.1 Current Version

The currently mounted HTTP API version is:

- `v1`

Combined with the global prefix, the public base path is:

- `/api/v1`

Versioning is URI-based, not header-based.

### 7.2 Deprecation Policy

No dedicated API-lifecycle deprecation header strategy or formal version-sunset policy was explicitly documented in the inspected runtime.

Conservative interpretation of the current strategy:

- backwards-compatible evolution happens within `/api/v1`
- a future breaking API revision should be introduced as a new URI version such as `/api/v2`
- the workflow-definition endpoint `POST /api/v1/workflow-definitions/{id}/deprecate` is **domain-level resource lifecycle management**, not an API-version deprecation mechanism

## 8. Webhooks (if applicable)

### 8.1 Webhook Event Catalogue

Webhook configuration records subscribe to event names stored in `eventTriggers`. The backend currently defines the following notification/webhook trigger enum values:

- `tenant.created`
- `workflow-execution.instance.created`
- `workflow-execution.transition.completed`
- `workflow-execution.instance.completed`
- `workflow-execution.instance.cancelled`

These are dispatched by `NotificationSubscriber`, which loads active tenant-scoped webhook configs and delivers the matching events to each configured endpoint.

### 8.2 Payload Schema

There are two relevant webhook-related schemas in the codebase.

#### Webhook configuration management schema

`CreateWebhookConfigDto` defines the management API payload shape:

| Field           | Type     | Notes                                  |
| --------------- | -------- | -------------------------------------- |
| `name`          | string   | Required, trimmed, `1-100` chars       |
| `url`           | string   | Required HTTPS URL                     |
| `secret`        | string   | Required signing secret, `1-500` chars |
| `eventTriggers` | string[] | Required array of event names          |
| `isActive`      | boolean  | Optional                               |

Response DTOs for webhook config resources include:

- `id`
- `tenantId`
- `name`
- `url`
- `secret`
- `eventTriggers`
- `isActive`
- `createdAt`
- `updatedAt`

#### Outbound webhook delivery payload schema

Outbound deliveries are JSON payloads sent via HTTP `POST`.

Source-backed characteristics:

- payload type is `Record<string, unknown>`
- delivery logs persist the exact payload in a `jsonb` column
- the payload mirrors the event context emitted by subscriber handlers
- common event contracts include fields such as `eventId`, `tenantId`, entity identifiers, actor metadata, and `occurredAt`, depending on event type

Delivery headers:

- `Content-Type: application/json`
- `X-Workflow-Signature: sha256=<hex>`
- `X-Workflow-Event: <event-name>`

The signature is computed as an HMAC-SHA256 digest of the raw JSON body using the configured webhook secret.

### 8.3 Retry Strategy

The inspected webhook delivery path does **not** show a formal multi-attempt retry scheduler/backoff loop in `WebhookService.deliver()`.

Observed behavior:

- each dispatch call performs one outbound HTTP `POST`
- every attempt is logged to `webhook_delivery_logs`
- the persistence model includes `attemptNumber`
- the service method accepts `attemptNumber = 1` as a parameter
- failures are logged and do not crash delivery logging

Conservative conclusion:

- retry tracking fields exist
- a concrete retry/backoff contract is **not explicitly implemented in the inspected direct webhook delivery path**, so it should not be documented as guaranteed behavior

## Appendix A: Full OpenAPI Specification

The complete OpenAPI 3.x contract is embedded below for reference.

- `backend/OPEN_API_SPEC.json`
