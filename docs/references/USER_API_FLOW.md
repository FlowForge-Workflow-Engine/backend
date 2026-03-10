# USER_API_FLOW.md

## Purpose

This document describes the **frontend/client journey** for using the workflow engine from:

1. tenant onboarding
2. user creation
3. optional tenant role setup
4. workflow authoring
5. workflow publication
6. workflow instance creation
7. transition discovery and execution
8. completion tracking
9. audit log querying

The goal is to show **which APIs the frontend should call, in what order, and why**.

> All routes below use the effective API prefix: `/api/v1`.

---

## Client assumptions

- The frontend authenticates with JWT access tokens.
- Mutating and tenant-scoped APIs require an authenticated user unless explicitly marked public.
- The frontend should persist, at minimum:
  - `accessToken`
  - `refreshToken`
  - `tenantId`
  - `tenantSlug` when available
  - created resource IDs such as `userId`, `roleId`, `workflowDefinitionId`, `stateId`, `transitionId`, and `instanceId`
  - the latest workflow instance `version` so future transition execution can send `lastKnownVersion`
- Workflow authoring is done against a **draft** definition first, then published.
- Published workflow versions are treated as immutable runtime snapshots.

---

## Recommended frontend state model

During this journey, the client usually needs to keep track of:

- current authenticated user
- current tenant context
- tenant roles
- current workflow definition draft
- state list for that draft
- transition list for that draft
- rule metadata for rule-builder UI
- workflow instance form schema
- workflow instance detail and current version
- audit log pagination state

---

## 1) Create the tenant and first admin user

### Primary onboarding API

**POST** `/api/v1/auth/register/tenant`

Use this when a brand new company/tenant is signing up.

### Request body

```json
{
  "tenantName": "Acme Corporation",
  "tenantSlug": "acme-corp",
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@acme.com",
  "password": "S3cur3P@ss!"
}
```

### Frontend notes

- This is the **normal tenant creation path**.
- Do **not** build the frontend around `POST /tenants`; that controller route is not the normal onboarding flow here.
- This onboarding call creates:
  - the tenant
  - tenant settings
  - default system roles
  - the first admin user
- The response gives the frontend enough information to start an authenticated session immediately.

### What the frontend should store after success

- `accessToken`
- `refreshToken`
- `tenant.id`
- `tenant.slug`
- created admin user info

### Useful follow-up read APIs

- **GET** `/api/v1/auth/me` to hydrate the current session
- **GET** `/api/v1/tenants/:id` to load tenant detail
- **GET** `/api/v1/tenants/:id/settings` to load tenant settings if the app shows tenant configuration early

---

## 2) Create more users for the tenant

There are **two valid frontend patterns** depending on the product flow.

### Option A — Admin creates users inside the tenant

**POST** `/api/v1/users`

Use this when a tenant admin creates users from an admin panel.

#### Request body

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@acme.com",
  "password": "S3cur3P@ss!",
  "roleNames": ["Admin", "Viewer"]
}
```

#### Frontend notes

- `roleNames` is optional.
- This is useful when the admin already knows which tenant roles should be assigned immediately.
- User creation is tenant-scoped through the authenticated admin session; the client does not send `tenantId` in the body.

#### Useful read APIs

- **GET** `/api/v1/users?page=1&limit=20`
- **GET** `/api/v1/users/:id`

### Option B — User self-registration into an existing tenant

**POST** `/api/v1/auth/register`

Use this when employees join an existing tenant by tenant slug.

#### Request body

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@acme.com",
  "password": "S3cur3P@ss!",
  "tenantSlug": "acme-corp"
}
```

#### Frontend notes

- Self-registration uses `tenantSlug`, not `tenantId`.
- Like tenant onboarding, this flow returns tokens so the new user can be considered logged in immediately.

---

## 3) Log in later sessions and establish tenant context

After onboarding or self-registration, later logins use a different shape.

### Login API

**POST** `/api/v1/auth/login`

#### Request body

```json
{
  "email": "john.doe@acme.com",
  "password": "S3cur3P@ss!",
  "tenantId": "123e4567-e89b-12d3-a456-426614174000"
}
```

### Important frontend note

- Login requires **`tenantId`**, not `tenantSlug`.
- A practical frontend flow is:
  1. persist the `tenantId` returned during onboarding/self-registration, or
  2. let the UI already know which tenant context the user is trying to access.

### Session maintenance APIs

- **POST** `/api/v1/auth/refresh`
- **POST** `/api/v1/auth/logout`
- **GET** `/api/v1/auth/me`

---

## 4) Create manual tenant roles (optional)

This step is optional if the default system roles are sufficient.

### List available roles first

**GET** `/api/v1/roles`

Use this to populate role pickers in the UI.

### Create a custom role

**POST** `/api/v1/roles`

#### Request body

```json
{
  "name": "Finance Reviewer",
  "description": "Can review and approve finance-related workflow steps"
}
```

### Frontend notes

- This route is intended for tenant admins.
- The created `roleId` becomes important later when configuring workflow transition access.

### Assign a role after user creation

**POST** `/api/v1/users/:id/roles`

#### Request body

```json
{
  "roleId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Useful read APIs after role changes

- **GET** `/api/v1/roles`
- **GET** `/api/v1/users?page=1&limit=20`
- **GET** `/api/v1/users/:id`

---

## 5) Create the workflow definition draft

### Create the draft definition

**POST** `/api/v1/workflow-definitions`

#### Request body

```json
{
  "name": "Leave Approval Workflow",
  "description": "Handles employee leave requests end-to-end."
}
```

### Useful read APIs

- **GET** `/api/v1/workflow-definitions?page=1&limit=20`
- **GET** `/api/v1/workflow-definitions/:id`

### Frontend notes

- After creation, store `workflowDefinitionId`.
- The frontend should treat this as the active draft being edited.

---

## 6) Add states to the workflow definition

### List states for the current draft

**GET** `/api/v1/workflow-definitions/:id/states?page=1&limit=100`

### Add a state

**POST** `/api/v1/workflow-definitions/:id/states`

#### Request body

```json
{
  "name": "Pending Approval",
  "description": "Waiting for manager review",
  "isInitial": true,
  "isTerminal": false,
  "positionX": 100,
  "positionY": 200,
  "metadata": {
    "color": "#FF5733",
    "icon": "clock"
  }
}
```

### Additional read/update APIs

- **GET** `/api/v1/workflow-definitions/:id/states/:stateId`
- **PATCH** `/api/v1/workflow-definitions/:id/states/:stateId`
- **DELETE** `/api/v1/workflow-definitions/:id/states/:stateId`

### Frontend notes

- Store each created `stateId` because transitions depend on real state IDs.
- Be careful with PATCH semantics for nullable fields such as `description`, `positionX`, `positionY`, and `metadata`.
- The typical UI pattern is to create all states first, then wire transitions between them.

---

## 7) Add transitions between states

### List transitions for the current draft

**GET** `/api/v1/workflow-definitions/:id/transitions?page=1&limit=100`

### Create a transition

**POST** `/api/v1/workflow-definitions/:id/transitions`

#### Request body

```json
{
  "name": "Submit for Approval",
  "fromStateId": "550e8400-e29b-41d4-a716-446655440000",
  "toStateId": "550e8400-e29b-41d4-a716-446655440001",
  "allowedRoleIds": ["550e8400-e29b-41d4-a716-446655440002"],
  "requiresComment": false
}
```

### Additional read APIs

- **GET** `/api/v1/workflow-definitions/:id/transitions/:transitionId`

### Important frontend notes

- Store each created `transitionId` because rules are attached to transitions.
- `allowedRoleIds` should usually come from the role list returned by **GET** `/api/v1/roles`.
- `allowedRoleIds: []` means the transition is open to any role.
- There is currently **no visible transition update endpoint**, so if the UI needs to change a transition, the supported path is usually delete and recreate.
- Transition deletion is available through:
  - **DELETE** `/api/v1/workflow-definitions/:id/transitions/:transitionId`

---

## 8) Build rules for transitions

Before the UI lets a user author rules, it should load the rule-authoring metadata.

### Rule builder helper API

**GET** `/api/v1/workflow-rules/metadata`

The frontend can use this endpoint to discover:

- supported fact namespaces
- rule types
- custom strategies
- expression operators
- operator decorators
- system paths
- payload path guidance
- top-level expression rule fields
- top-level custom rule fields
- example expression/custom rule definition shapes

This is especially useful for dynamically building a rule editor instead of hardcoding rule vocabulary.

### Key frontend-discoverable rule fields

- Expression rule definition fields:
  - `type`
  - `all`
  - `any`
  - `not`
- Custom rule definition fields:
  - `type`
  - `strategy`
  - `params`

### Add a rule to a transition

**POST** `/api/v1/workflow-definitions/:id/transitions/:transitionId/rules`

#### Request body

```json
{
  "ruleName": "amount-must-exceed-1000",
  "ruleDefinition": {
    "all": [
      {
        "fact": "payload",
        "path": "$.amount",
        "operator": "greaterThan",
        "value": 1000
      }
    ]
  },
  "evaluationOrder": 0,
  "schemaFields": [
    {
      "key": "amount",
      "type": "number",
      "label": "Requested Amount",
      "required": true
    }
  ]
}
```

### List rules for a transition

**GET** `/api/v1/workflow-definitions/:id/transitions/:transitionId/rules`

### Important frontend notes

- If `ruleDefinition` references payload fields, the client should also send matching `schemaFields`.
- `schemaFields` contribute to the workflow instance creation schema.
- The UI can use the metadata endpoint to guide users toward supported operators and definition structures.
- There is currently **no visible rule update or delete endpoint** in this surface, so author carefully.

---

## 9) Read the generated instance form schema before publish or before runtime forms

Once payload-dependent rules add `schemaFields`, the frontend can read the consolidated form schema.

### Form schema API

**GET** `/api/v1/workflow-definitions/:id/instance-form-schema`

### Frontend use cases

- render the form used to create workflow instances
- validate required payload fields client-side before submit
- help workflow designers verify that rule-linked payload keys are exposed correctly

### Important note

- This schema is not authored through a dedicated standalone endpoint.
- It is accumulated from rule creation requests that include `schemaFields`.

---

## 10) Publish the workflow definition

### Publish API

**POST** `/api/v1/workflow-definitions/:id/publish`

### Why the frontend does this only after authoring is complete

- runtime instances are created from published definitions
- published versions are immutable snapshots for execution
- states, transitions, and rules should be in the desired draft shape before publish

### Useful post-publish read APIs

- **GET** `/api/v1/workflow-definitions/:id`
- **GET** `/api/v1/workflow-definitions/:id/versions`
- **GET** `/api/v1/workflow-definitions/:id/versions/:versionNumber`

### Optional lifecycle API

- **POST** `/api/v1/workflow-definitions/:id/deprecate`

---

## 11) Create a workflow instance with initial payload

Before creating the instance, the frontend should usually fetch the instance form schema.

### Recommended read before create

- **GET** `/api/v1/workflow-definitions/:id/instance-form-schema`

### Create instance API

**POST** `/api/v1/workflow-instances`

#### Request body

```json
{
  "workflowDefinitionId": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "requestedBy": "John Doe",
    "amount": 5000
  }
}
```

### Useful follow-up read APIs

- **GET** `/api/v1/workflow-instances?page=1&limit=20`
- **GET** `/api/v1/workflow-instances?status=ACTIVE&page=1&limit=20`
- **GET** `/api/v1/workflow-instances?workflowDefinitionId=:workflowDefinitionId&page=1&limit=20`
- **GET** `/api/v1/workflow-instances/:id`

### Frontend notes

- Store the returned `instanceId`.
- Also store the returned instance `version`; this is required later as `lastKnownVersion` during transition execution.

---

## 12) List transitions available to the current user for this instance

### API

**GET** `/api/v1/workflow-instances/:id/allowed-transitions`

### Important frontend notes

- This endpoint currently returns a **raw array**, not the normal `{ status, data }` wrapper.
- The result is based on:
  - the instance's current state
  - the current user's role IDs
  - the transition configuration in the published snapshot
- If the instance is no longer active, the response can be an empty array.

### Very important runtime behavior

- This endpoint is best treated as an **action discovery API**.
- It filters transitions by state and role access.
- Actual business rule evaluation still happens during transition execution.
- So the UI should not assume that a listed transition is guaranteed to succeed when executed.

### Practical UI use

- render action buttons for the current user
- inspect whether a transition requires a comment
- keep the selected `transitionId` for the execution call

---

## 13) Execute a transition on the workflow instance

### Recommended read before execute

- **GET** `/api/v1/workflow-instances/:id`

Use the latest instance detail to read the most recent `version`.

### Execute API

**POST** `/api/v1/workflow-instances/:id/transitions`

#### Request body

```json
{
  "transitionId": "550e8400-e29b-41d4-a716-446655440000",
  "lastKnownVersion": 1,
  "comment": "Approved — all documents verified.",
  "idempotencyKey": "req-abc123"
}
```

### Important frontend notes

- The correct optimistic-lock field is **`lastKnownVersion`**.
- Do **not** send `expectedVersion`.
- If the selected transition requires a comment, the client should enforce comment entry before submit.
- `idempotencyKey` is optional but strongly useful for retry-safe UX.
- Transition execution validates:
  - the instance is active
  - the caller still has role access
  - the provided version still matches
  - the transition's rules pass against runtime payload/user/instance context

### After a successful transition

The frontend should refresh:

- **GET** `/api/v1/workflow-instances/:id`
- **GET** `/api/v1/workflow-instances/:id/allowed-transitions`
- optionally **GET** `/api/v1/workflow-instances?page=1&limit=20`

This gives the UI the new state, the new version, and the next available actions.

---

## 14) Detect workflow completion

An instance becomes completed when a successful transition moves it into a terminal state.

### Useful read APIs

- **GET** `/api/v1/workflow-instances/:id`
- **GET** `/api/v1/workflow-instances?status=COMPLETED&page=1&limit=20`

### Frontend notes

- Once completed, the instance should no longer present normal forward transitions.
- `GET /allowed-transitions` is expected to become empty for non-active instances.
- The UI can switch into a read-only or history mode once completion is detected.

### Optional runtime action

- **POST** `/api/v1/workflow-instances/:id/cancel`

This is not part of the happy-path completion flow, but it exists as another runtime action.

---

## 15) Query audit logs for the workflow instance

Audit history is maintained for workflow activity and can be queried from the frontend.

### Audit log API

**GET** `/api/v1/workflow-instances/:id/audit-logs?page=1&limit=20`

### When the frontend should call it

- after instance creation
- after each transition execution
- when rendering an instance timeline/history drawer
- when showing who acted, what happened, and when

### Frontend notes

- This is the main history/timeline API for an individual workflow instance.
- Because it is paginated, the UI should maintain page/limit state for infinite scroll or pageable tables.

---

## Recommended end-to-end frontend order

For a typical admin/designer + runtime user flow, the practical API order is:

1. **POST** `/api/v1/auth/register/tenant`
2. **GET** `/api/v1/auth/me`
3. **GET** `/api/v1/roles`
4. optionally **POST** `/api/v1/roles`
5. optionally **POST** `/api/v1/users`
6. optionally **POST** `/api/v1/users/:id/roles`
7. **POST** `/api/v1/workflow-definitions`
8. **POST** `/api/v1/workflow-definitions/:id/states` (repeat as needed)
9. **POST** `/api/v1/workflow-definitions/:id/transitions` (repeat as needed)
10. **GET** `/api/v1/workflow-rules/metadata`
11. **POST** `/api/v1/workflow-definitions/:id/transitions/:transitionId/rules` (repeat as needed)
12. **GET** `/api/v1/workflow-definitions/:id/instance-form-schema`
13. **POST** `/api/v1/workflow-definitions/:id/publish`
14. **POST** `/api/v1/workflow-instances`
15. **GET** `/api/v1/workflow-instances/:id/allowed-transitions`
16. **POST** `/api/v1/workflow-instances/:id/transitions`
17. **GET** `/api/v1/workflow-instances/:id`
18. repeat steps 15-17 until the instance reaches a terminal state
19. **GET** `/api/v1/workflow-instances/:id/audit-logs?page=1&limit=20`

---

## Most important frontend caveats to remember

- Tenant onboarding starts with **`POST /api/v1/auth/register/tenant`**, not `POST /tenants`.
- Self-registration uses **`tenantSlug`**.
- Login uses **`tenantId`**.
- Roles should be queried before building transition role pickers.
- `allowedRoleIds: []` means a transition is open to all roles.
- Use **`GET /api/v1/workflow-rules/metadata`** to drive rule-builder UI.
- Use **`GET /api/v1/workflow-definitions/:id/instance-form-schema`** to drive instance payload forms.
- `GET /api/v1/workflow-instances/:id/allowed-transitions` returns a **raw array**.
- `GET /allowed-transitions` is for action discovery, but rule checks still happen on execution.
- Transition execution must send **`lastKnownVersion`**.
- Audit history is queried via **`GET /api/v1/workflow-instances/:id/audit-logs`**.