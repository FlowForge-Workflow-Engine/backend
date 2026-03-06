# SUMMARY.md

## Purpose
This file is a handoff summary for future agents working in this repository. It captures the most important conversation context, architectural preferences, implemented changes, validation status, and known follow-ups.

## Repository Context
- Project: Multi-Tenant Workflow Engine
- Stack: NestJS, TypeScript, TypeORM, Redis, NATS
- Architecture: modular monolith with strong tenant isolation and explicit module ownership
- Workspace root: `workflow-engine`

## Read This Before Starting Work
Before editing code, a new agent should first read:
1. `SUMMARY.md`
2. `SCHEMA_DESIGN_PHILOSOPHY.md`
3. `AGENT_PROMPT.md`
4. the exact module files relevant to the task

Minimum context to gather before editing:
- confirm module ownership of the feature
- confirm existing controller/service/repository/DTO patterns in that module
- confirm the exact response wrapper pattern already used there
- confirm the relevant error constants in `libs/shared/src/constants/app-errors.enum.ts`

## Agent Operating Rules And Constraints

### Change Strategy
- Make conservative, targeted changes.
- Prefer extending existing flows over introducing new abstractions unless clearly needed.
- Do not add broad ORM relations just for convenience.
- Prefer explicit loading / explicit joins / repository methods.
- Preserve existing module boundaries.

### Ownership Rules
- Roles and RBAC features belong to `src/modules/auth`.
- Tenant membership and tenant mutation protection belong to `src/modules/tenant`.
- Workflow definition, version, state, and transition APIs belong to `src/modules/workflow-definition`.
- Do not place role-discovery APIs inside workflow-definition.

### Safety Rules
- Do not commit, push, merge, deploy, or install dependencies without explicit user permission.
- If a dependency is required, propose the exact package-manager command first.
- Do not manually edit package manifests/lockfiles when a package manager command should be used instead.
- Preserve user intent and avoid unrelated refactors.

### Validation Rules
- After making code changes, run verification.
- Minimum verification standard:
  - IDE diagnostics for touched files
  - `npx tsc --noEmit`
- If tests exist for the touched area, prefer the smallest relevant test scope and run them.
- If no relevant tests exist, explicitly note that fact in the handoff/summary.

### API / DTO Rules
- List endpoints typically return `CountApiResponseDto<T[]>` with `{ status, count, data }`.
- Detail/mutation endpoints typically return `ApiResponseDto<T>` with `{ status, data }`.
- Follow local controller patterns even if they are not perfectly REST-conventional.
- In this repo, some `GET` list endpoints use `@Body()` for pagination/filter DTOs; match the existing local style unless the user requests a redesign.
- For nested or embedded objects, prefer summary DTOs over full DTOs.
- Add Swagger decorators/response schemas for new APIs.

### Editing Rules Specific To This Conversation
- Preserve `TenantController.create()` as commented out unless the user explicitly asks to restore it.
- Maintain validator order when editing DTOs.
- If touching `src/modules/workflow-definition/services/workflow-transition.service.ts`, preserve the user’s manual edits.
- Be careful with PATCH semantics: omitted field vs explicit `null` matters for nullable update fields.

## Important Architectural Preferences From The User
- Prefer explicit loading / explicit joins over broad ORM relations.
- Keep module ownership clean:
  - roles belong to `auth`
  - workflow version read APIs belong to `workflow-definition`
- Follow existing repo patterns when the user says “similarly” or points to an existing file.
- Preserve `TenantController.create()` as commented out unless explicitly asked otherwise.
- For nested/embedded response payloads, prefer summary DTOs instead of full detail DTOs.
- For workflow-definition mutations, respect draft-only business rules where applicable.
- Add Swagger decorators/response schemas for new APIs.
- Maintain validator order when editing DTOs.

## Domain Rules / Business Constraints Learned In This Conversation
- Workflow definitions use versioned immutable snapshots when published.
- Running instances should rely on immutable version snapshots, not mutable live-definition rows.
- Workflow definition version records include `workflowDefinitionId`, `versionNumber`, `snapshot`, `isActive`, `publishedBy`, `publishedAt`.
- Only one active version per workflow definition should exist at a time.
- Workflow state mutation logic must respect draft-only restrictions.
- Initial state invariants must be enforced when updating workflow states.
- Tenant mutation endpoints must verify tenant membership and require tenant admin authorization for mutation actions.
- Custom tenant roles may be created, but only by tenant admins.
- Embedded role payloads in user/auth APIs must only expose `id`, `name`, and `isSystemRole`.

## Key Guidance Files
- `AGENT_PROMPT.md`
- `SCHEMA_DESIGN_PHILOSOPHY.md`
- `libs/shared/src/dto/pagination.dto.ts`
- `libs/shared/src/utils/paginaton.ts`
- `libs/shared/src/dto/base-response.dto.ts`
- `libs/shared/src/constants/app-errors.enum.ts`
- `libs/shared/src/decorators/roles.decorator.ts`
- `libs/shared/src/guards/roles.guard.ts`
- `libs/shared/src/constants/default-system-roles.enum.ts`

## Current State Snapshot
At the end of this conversation, the following feature areas were already addressed:
- schema design philosophy documentation
- user responses enriched with roles
- tenant mutation authorization hardening
- pagination consistency across multiple list endpoints
- workflow state update API
- tenant-scoped role listing and custom role creation APIs
- full-vs-summary role DTO split
- workflow definition version read APIs

This means a future agent should avoid re-solving these areas unless the user explicitly asks for a change.

## Major Conversation Topics And Outcomes

### 1. Schema Design Philosophy
- A `SCHEMA_DESIGN_PHILOSOPHY.md` document was created and expanded.
- It explains why many entities intentionally avoid rich ORM relations.
- Workflow-definition rationale was framed around aggregate-root / snapshot / explicit loading principles.

### 2. User Responses Needed Role Data
- User APIs were updated to expose the roles assigned to a user.
- This was implemented with explicit loading, not broad ORM navigation.
- Later refined so embedded user/auth role payloads only expose:
  - `id`
  - `name`
  - `isSystemRole`

### 3. Tenant Mutation Security Gap
- Tenant mutation flows were tightened so callers must belong to the tenant.
- Mutation endpoints were protected with `@Roles(DefaultSystemRoles.ADMIN)`.
- Ownership verification was implemented in the service layer.

### 4. Pagination Consistency Across Controllers
- The user requested consistency with `src/modules/auth/controllers/user.controller.ts`.
- Pagination was threaded through relevant `findAll()` endpoints using:
  - `Find*Dto extends PaginationDto`
  - shared `pagination(page, limit)` helper
  - repository `skip/take`

### 5. Workflow State Update API
- A PATCH API was added for updating workflow states.
- Supports fields such as `positionX`, `positionY`, etc.
- Logic enforces draft-only updates and initial-state invariants.
- Swagger and response DTOs were added.

### 6. Tenant Role APIs
- The user identified that the frontend needs tenant-specific roles to populate `allowedRoleIds` for workflow transitions.
- Implemented in the `auth` module:
  - `GET /roles`
  - `POST /roles` (Admin only)
- Custom role creation is tenant-scoped and restricted to tenant admins.

### 7. Role DTO Split
- `RoleResponseDto.fromEntity(role)` originally over-shared role fields everywhere.
- Solution implemented:
  - `RoleResponseDto` for dedicated role APIs (`/roles`)
  - `RoleSummaryResponseDto` for embedded role payloads in `/users` and `/auth/me`
- Embedded role payloads now only return `id`, `name`, `isSystemRole`.
- This summary-vs-detail DTO approach is now a preferred pattern in this codebase.

### 8. Workflow Definition Version Read APIs
The user requested read APIs for immutable workflow definition versions, based on evidence in:
- `src/modules/workflow-definition/services/workflow-version.service.ts`
- `src/modules/workflow-definition/entities/workflow-definition-version.entity.ts`

Implemented endpoints:
- `GET /workflow-definitions/:id/versions`
  - returns workflow basic info plus all versions
  - each version includes at least `versionNumber`, `isActive`, `publishedBy`, `publishedAt`
- `GET /workflow-definitions/:id/versions/:versionNumber`
  - returns full immutable version detail including `snapshot`
- The implementation is tenant-scoped and version lookup uses `DEFINITION_VERSION_NOT_FOUND` when needed.

## Key Files Added / Modified During The Conversation

### Auth module
- `src/modules/auth/controllers/role.controller.ts`
- `src/modules/auth/services/role.service.ts`
- `src/modules/auth/dto/create-role.dto.ts`
- `src/modules/auth/dto/dto-response/role-response.dto.ts`
- `src/modules/auth/dto/dto-response/user-response.dto.ts`
- `src/modules/auth/services/user.service.ts`
- `src/modules/auth/auth.module.ts`

### Tenant module
- `src/modules/tenant/controllers/tenant.controller.ts`
- `src/modules/tenant/services/tenant.service.ts`

### Workflow-definition module
- `src/modules/workflow-definition/controllers/workflow-definition.controller.ts`
- `src/modules/workflow-definition/controllers/workflow-state.controller.ts`
- `src/modules/workflow-definition/services/workflow-definition.service.ts`
- `src/modules/workflow-definition/services/workflow-version.service.ts`
- `src/modules/workflow-definition/services/workflow-state.service.ts`
- `src/modules/workflow-definition/repositories/workflow-version.repository.ts`
- `src/modules/workflow-definition/dto/dto-response/workflow-definition-response.dto.ts`
- plus pagination-related DTO/service/repository adjustments in definition/state/transition flows

## Important Files To Inspect Before Touching Specific Areas

### If working on roles / auth payloads
- `src/modules/auth/controllers/role.controller.ts`
- `src/modules/auth/dto/dto-response/role-response.dto.ts`
- `src/modules/auth/dto/dto-response/user-response.dto.ts`

### If working on tenant authorization
- `src/modules/tenant/controllers/tenant.controller.ts`
- `src/modules/tenant/services/tenant.service.ts`
- `libs/shared/src/decorators/roles.decorator.ts`
- `libs/shared/src/constants/default-system-roles.enum.ts`

### If working on workflow versioning / publication
- `src/modules/workflow-definition/services/workflow-version.service.ts`
- `src/modules/workflow-definition/entities/workflow-definition-version.entity.ts`
- `src/modules/workflow-definition/repositories/workflow-version.repository.ts`
- `src/modules/workflow-definition/controllers/workflow-definition.controller.ts`
- `src/modules/workflow-definition/dto/dto-response/workflow-definition-response.dto.ts`

## Important API / DTO Conventions In This Repo
- List endpoints commonly return `CountApiResponseDto<T[]>` with `{ status, count, data }`.
- Detail/mutation endpoints commonly return `ApiResponseDto<T>` with `{ status, data }`.
- Existing codebase style may use `GET` with `@Body()` for list filters/pagination; match existing local patterns unless instructed otherwise.
- Summary-vs-detail DTO split is preferred for nested payloads.

## Response-Shaping Decisions Already Agreed With The User
- Dedicated `/roles` APIs may return full role data.
- Embedded roles in `/users` and `/auth/me` must only expose:
  - `id`
  - `name`
  - `isSystemRole`
- Workflow version list responses should provide workflow basic info plus version summaries.
- Workflow version detail responses may return full immutable snapshot detail.

## Validation Status
- After major changes, diagnostics and `npx tsc --noEmit` were run repeatedly.
- Latest verified status for the workflow version read APIs:
  - no diagnostics
  - `npx tsc --noEmit` passed
- A previous unrelated `supertest` issue had existed earlier in conversation history, but later typecheck runs completed successfully.
- No existing workflow-definition spec/e2e test files were found to extend for the version API addition.

## Manual Edit / Merge Caution
- The user had manually edited some workflow-definition files during the conversation.
- Even where those edits were formatting-only, a future agent should inspect current file content before editing rather than assuming older patch context is still exact.
- If a file has already been touched by both the user and an agent, prefer minimal diffs.

## Known Follow-Ups / Caveats
- In workflow execution, there may be a role identity inconsistency:
  - definition-side transition config stores `allowedRoleIds`
  - execution-side checks may still compare against role names/comments suggesting names
- If another agent touches `src/modules/workflow-definition/services/workflow-transition.service.ts`, preserve the user’s manual edits.
- If richer UX is needed later, `publishedBy` on workflow version responses could be expanded from raw user ID into lightweight user info.

## Recommended Workflow For A New Agent
1. Identify the owning module.
2. Read the local controller/service/repository/DTO files first.
3. Reuse existing response wrappers, decorators, error constants, and pagination helpers.
4. Make the smallest safe edit.
5. Run diagnostics and `npx tsc --noEmit`.
6. If behavior is user-visible, summarize the exact API/output shape after the change.

## Current Useful Endpoints Added In This Conversation
- `GET /roles`
- `POST /roles` (Admin only)
- `PATCH` workflow-state update endpoint
- `GET /workflow-definitions/:id/versions`
- `GET /workflow-definitions/:id/versions/:versionNumber`

## Best Next-Step Mindset For Another Agent
1. Read this file plus `SCHEMA_DESIGN_PHILOSOPHY.md`.
2. Preserve module boundaries and explicit loading style.
3. Reuse existing response wrappers and Swagger decorators.
4. Run diagnostics and `npx tsc --noEmit` after edits.
5. Prefer small, targeted changes over introducing new relations or broad refactors.
6. Do not broaden payloads without checking whether the user previously requested summary-only fields.
7. Treat workflow version snapshots as immutable read models.

