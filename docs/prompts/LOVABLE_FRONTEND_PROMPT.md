# Lovable Prompt — Workflow Engine Frontend

## ⚠️ Read This First — How to Use This Prompt

1. Go to [https://lovable.dev](https://lovable.dev) and create a new project
2. In the **first message**, paste the entire content of this file
3. Also **attach** the `OPEN_API_SPEC.json` file alongside the message — Lovable supports file uploads
4. After generation, Lovable will give you a preview. Use follow-up messages for any refinements
5. To **download**: click the GitHub export button or "Download as ZIP" in Lovable's top-right menu
6. To **run locally**: see the section at the bottom of this prompt

---

## Project Brief

Build a full-stack-connected React SPA called **FlowForge** — a multi-tenant workflow engine management platform. The backend is already running. The frontend must connect to it via REST APIs and implement every user-facing flow described below.

This is a **production-grade app**, not a prototype. Every component must be properly typed, every API call must be handled with loading/error/success states, and every form must have real validation, also ensure to have code level comments for the codebase files.

---

## Tech Stack — Mandatory, No Substitutions

```
React 18 (with TypeScript, strict)
Vite (build tool)
TanStack Query v5 (all server state — no useState for fetched data)
Zustand v4 (client state: auth session, designer state)
React Router v6 (routing)
Axios (HTTP client with interceptors)
React Hook Form + Zod (forms and validation)
Tailwind CSS v3 (styling)
shadcn/ui (component library — use this for all UI primitives)
lucide-react (icons)
ReactFlow (visual workflow diagram on the designer page)
date-fns (date formatting)
```

---

## Environment Setup

Create a `.env` file at project root:

```
VITE_API_BASE_URL=https://eafe-103-182-11-183.ngrok-free.app
```

All API calls use `import.meta.env.VITE_API_BASE_URL` as base URL.

---

## Theme — Dark/Light Mode

- Implement a theme toggle (sun/moon icon in top-right of navbar)
- Persist theme preference in `localStorage` under key `flowforge-theme`
- **Light mode**: clean white backgrounds, `slate-50` surface, `slate-900` text
- **Dark mode**: Do NOT use near-black. Use grey-scale: `zinc-800` backgrounds, `zinc-700` surfaces, `zinc-900` for sidebar, `zinc-100` text. The dark mode should feel like a warm grey office, not a cave.
- The toggle should smoothly transition (add `transition-colors duration-200` to the root layout)

---

## API Client Setup

Create `src/lib/api-client.ts`:

```typescript
import axios from "axios";
import { useAuthStore } from "@/stores/auth-store";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true", // Required — prevents ngrok warning page
  },
});

// Request interceptor — attach JWT
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — auto refresh on 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/refresh`,
          { refreshToken },
          { headers: { "ngrok-skip-browser-warning": "true" } },
        );
        useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(original);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
```

---

## Response Wrapper Contract — Critical

**All** API responses (except one) are wrapped:

```typescript
// Standard single item:
{ status: "success", data: T }

// Standard list:
{ status: "success", count: number, data: T[] }

// Exception — this one returns a raw array, NOT wrapped:
GET /api/v1/workflow-instances/:id/allowed-transitions → AllowedTransition[]
```

Create a helper:

```typescript
// src/lib/api-helpers.ts
export const unwrap = <T>(response: { data: { data: T } }): T => response.data.data;
export const unwrapList = <T>(response: { data: { data: T[]; count: number } }) => ({
  items: response.data.data,
  count: response.data.count,
});
```

---

## JWT Payload Shape

When decoded, the JWT contains:

```typescript
interface JwtPayload {
  sub: string; // userId
  email: string;
  firstName: string;
  tenantId: string;
  tenantSlug: string;
  roles: string[]; // e.g. ["Admin"]
  roleIds: string[]; // UUID array
  plan: string;
  iat: number;
  exp: number;
}
```

---

## Zustand Stores

### `src/stores/auth-store.ts`

```typescript
interface AuthStore {
  accessToken: string | null;
  refreshToken: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    tenantId: string;
    tenantSlug: string;
    roles: string[];
    roleIds: string[];
    plan: string;
  } | null;
  isAuthenticated: boolean;
  setSession: (accessToken: string, refreshToken: string, user: AuthStore["user"]) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}
```

Persist `accessToken`, `refreshToken`, and `user` to `localStorage` (use `zustand/middleware` `persist`).

### `src/stores/workflow-designer-store.ts`

```typescript
interface WorkflowDesignerStore {
  definitionId: string | null;
  definitionName: string;
  definitionStatus: "draft" | "published" | "deprecated";
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  rules: Record<string, TransitionRule[]>; // keyed by transitionId
  formSchema: FormSchemaField[];
  ruleMetadata: RuleMetadata | null;
  selectedStateId: string | null;
  selectedTransitionId: string | null;
  setDefinition: (def: WorkflowDefinition) => void;
  setStates: (states: WorkflowState[]) => void;
  setTransitions: (transitions: WorkflowTransition[]) => void;
  setRulesForTransition: (transitionId: string, rules: TransitionRule[]) => void;
  setFormSchema: (fields: FormSchemaField[]) => void;
  setRuleMetadata: (metadata: RuleMetadata) => void;
  reset: () => void;
}
```

---

## TanStack Query Setup

Create `src/lib/query-client.ts`:

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: (count, err: any) => {
        if (err?.response?.status === 401) return false;
        if (err?.response?.status === 403) return false;
        if (err?.response?.status === 404) return false;
        return count < 2;
      },
    },
  },
});
```

Create `src/lib/query-keys.ts` with organized query key factories:

```typescript
export const queryKeys = {
  auth: { me: () => ["auth", "me"] },
  users: {
    list: (params?: object) => ["users", "list", params],
    detail: (id: string) => ["users", id],
  },
  roles: { list: () => ["roles", "list"] },
  tenants: {
    detail: (id: string) => ["tenants", id],
    settings: (id: string) => ["tenants", id, "settings"],
    featureFlags: (id: string) => ["tenants", id, "feature-flags"],
  },
  workflowDefinitions: {
    list: (params?: object) => ["workflow-definitions", "list", params],
    detail: (id: string) => ["workflow-definitions", id],
    states: (id: string) => ["workflow-definitions", id, "states"],
    transitions: (id: string) => ["workflow-definitions", id, "transitions"],
    rules: (id: string, transitionId: string) => [
      "workflow-definitions",
      id,
      "transitions",
      transitionId,
      "rules",
    ],
    formSchema: (id: string) => ["workflow-definitions", id, "form-schema"],
    versions: (id: string) => ["workflow-definitions", id, "versions"],
  },
  workflowInstances: {
    list: (params?: object) => ["workflow-instances", "list", params],
    detail: (id: string) => ["workflow-instances", id],
    allowedTransitions: (id: string) => ["workflow-instances", id, "allowed-transitions"],
    auditLogs: (id: string, params?: object) => ["workflow-instances", id, "audit-logs", params],
  },
  ruleMetadata: { all: () => ["rule-metadata"] },
  notificationTemplates: {
    list: () => ["notification-templates", "list"],
    detail: (id: string) => ["notification-templates", id],
  },
  webhookConfigs: {
    list: () => ["webhook-configs", "list"],
    detail: (id: string) => ["webhook-configs", id],
  },
};
```

---

## Routing Structure

```
/                          → redirect to /dashboard if authenticated, else /login
/login                     → Login page (public)
/register                  → Register tenant page (public)
/register/join             → Self-register into existing tenant (public)

/dashboard                 → Dashboard (protected)

/workflows                 → Workflow definitions list (protected)
/workflows/new             → Create workflow (modal or inline form)
/workflows/:id             → Workflow designer (protected, Admin only)

/instances                 → Workflow instances list (protected)
/instances/new             → Create instance (protected)
/instances/:id             → Instance detail + audit log (protected)

/users                     → User management (protected, Admin only)
/roles                     → Role management (protected, Admin only)

/settings                  → Tenant settings + feature flags (protected, Admin only)
/notifications             → Notification templates (protected, Admin only)
/webhooks                  → Webhook configs (protected, Admin only)
```

Use a `<ProtectedRoute>` component that checks `isAuthenticated`. Use a `<AdminRoute>` wrapper that checks `user.roles.includes('Admin')`.

---

## Layout

### AppShell layout (authenticated pages)

- **Sidebar** (fixed left, 240px wide):
  - FlowForge logo + tenant name at top
  - Navigation items with icons:
    - Dashboard (LayoutDashboard icon)
    - Workflows (GitBranch icon)
    - Instances (Play icon)
    - Users (Users icon) — Admin only
    - Roles (Shield icon) — Admin only
    - Settings (Settings icon) — Admin only
    - Notifications (Bell icon) — Admin only
    - Webhooks (Webhook icon) — Admin only
  - User avatar + name at bottom
  - Theme toggle at bottom

- **Topbar** (sticky, full width minus sidebar):
  - Page title (dynamic, based on route)
  - Breadcrumbs
  - Theme toggle (mirror from sidebar for mobile)

- **Main content area**: scrollable, `p-6`

### Sidebar active state

Highlight the current route's nav item with a `bg-primary/10 text-primary` pill.

---

## Page Specifications

---

### Page 1: Register Tenant (`/register`)

**Purpose**: Onboard a new company and its first admin user.

**API**: `POST /api/v1/auth/register/tenant`

**Form fields** (with Zod validation):

- Company Name (tenantName) — 2–100 chars
- Company Slug (tenantSlug) — lowercase, letters/numbers/hyphens, 3–50 chars. Show a real-time slug preview: "your-app.flowforge.io/`{slug}`"
- First Name — 1–50 chars
- Last Name — 1–50 chars
- Email — valid email
- Password — 8–32 chars, must contain uppercase + lowercase + number or special char. Show password strength meter.
- Confirm Password — must match

**After success**:

- Store `accessToken`, `refreshToken`, `user.id`, `tenant.id`, `tenant.slug`
- Decode JWT to populate Zustand auth store
- Redirect to `/dashboard`
- Show toast: "Welcome to FlowForge, `{firstName}`! 🎉"

**At bottom**: "Already have an account? Sign in" → `/login` | "Joining an existing company?" → `/register/join`

---

### Page 2: Self-Register (`/register/join`)

**Purpose**: An employee joins an existing tenant by slug.

**API**: `POST /api/v1/auth/register`

**Request body**:

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@acme.com",
  "password": "S3cur3P@ss!",
  "tenantSlug": "acme-corp"
}
```

**Form fields**: firstName, lastName, email, password, confirmPassword, tenantSlug (label: "Company Slug — ask your admin").

**After success**: same as register tenant.

---

### Page 3: Login (`/login`)

**Purpose**: Authenticate a returning user.

**API**: `POST /api/v1/auth/login`

**CRITICAL**: Login requires `tenantId` (UUID), not `tenantSlug`. Implement this UX:

1. User types their email
2. On blur or "Continue" click, do NOT look up tenant — instead, if `tenantId` is in `localStorage` (from a previous session), pre-fill it
3. Show a separate input labelled "Tenant ID" with placeholder `Your company's Tenant ID (UUID)`. Below it: "You received this when your account was created." with a small info icon.
4. Password field

**Request body**:

```json
{
  "email": "user@acme.com",
  "password": "S3cur3P@ss!",
  "tenantId": "uuid-here"
}
```

**After success**:

- Call `GET /api/v1/auth/me` to fetch full user profile
- Populate Zustand store with user info + tokens
- Redirect to `/dashboard`

**At bottom**: "Don't have an account?" → `/register` | "Joining a company?" → `/register/join`

---

### Page 4: Dashboard (`/dashboard`)

**Purpose**: Overview at a glance.

**Data to fetch on mount** (parallel):

- `GET /api/v1/workflow-definitions?page=1&limit=100` → count of total, published, draft
- `GET /api/v1/workflow-instances?page=1&limit=5` → recent instances
- `GET /api/v1/workflow-instances?status=active&page=1&limit=100` → active count
- `GET /api/v1/users?page=1&limit=1` → use count field for total user count

**Layout**:

- Top row: 4 stat cards
  - "Total Workflows" — count with GitBranch icon
  - "Active Instances" — count with Play icon, green badge
  - "Total Users" — count with Users icon
  - "Published Workflows" — count with CheckCircle icon
- Second row: "Recent Instances" table (5 rows max) with columns: ID (truncated UUID), Workflow, State, Status badge, Created
- Third row: "Your Workflows" list (3 most recent with status badges)
- Quick action buttons: "Design New Workflow", "Start New Instance"

**Status badges**:

- `active` → green `bg-green-100 text-green-800` (dark: `bg-green-900/30 text-green-400`)
- `completed` → blue
- `cancelled` → grey
- `draft` → yellow/amber
- `published` → green
- `deprecated` → red/rose

---

### Page 5: Workflow Definitions List (`/workflows`)

**API**: `GET /api/v1/workflow-definitions?page=1&limit=20`

**Layout**:

- Page title "Workflows" with "New Workflow" button (+ icon, primary button, top-right)
- Filter bar: search by name (client-side filter), filter by status dropdown (All / Draft / Published / Deprecated)
- Table/card grid of definitions:
  - Name
  - Status badge
  - Current version (v`{n}`)
  - Created date
  - Actions: "Open Designer" button → navigate to `/workflows/:id`
  - Admin-only: Delete button (only if status = draft)
- Empty state: illustration + "No workflows yet. Create your first workflow." button

**Create Workflow Dialog** (opens on "New Workflow" click):

- **API**: `POST /api/v1/workflow-definitions`
- Fields: Name (required), Description (optional textarea)
- On success: invalidate `workflow-definitions` query, close dialog, navigate to `/workflows/:id` (the new draft's designer)

---

### Page 6: Workflow Designer (`/workflows/:id`)

This is the most complex page. It has two main panels and a top toolbar.

**On mount, fetch in parallel**:

1. `GET /api/v1/workflow-definitions/:id` → definition detail
2. `GET /api/v1/workflow-definitions/:id/states?page=1&limit=100` → all states
3. `GET /api/v1/workflow-definitions/:id/transitions?page=1&limit=100` → all transitions
4. `GET /api/v1/workflow-rules/metadata` → rule builder vocabulary (cache this globally)
5. `GET /api/v1/workflow-definitions/:id/instance-form-schema` → current form schema

Store all of this in `workflowDesignerStore`.

#### Top Toolbar

- Workflow name (editable inline if draft)
- Status badge
- Version: "v`{currentVersion}`"
- Tabs: **Design** | **Form Schema** | **Versions**
- If status = `draft`: "Publish" button (primary, rocket icon) — shows confirmation dialog before calling `POST /api/v1/workflow-definitions/:id/publish`
- If status = `published`: "Deprecate" button (outline, warning style) — shows confirmation
- Read-only banner if status ≠ `draft`: "This workflow is published and read-only. Create a new version to make changes."

#### Design Tab — Split Layout

**Left Panel (320px)**: Sidebar with two collapsible sections

**States Section**:

- Heading "States" + "Add State" button (+ icon)
- List of state cards:
  - State name
  - Badges: "Initial" (blue pill) if `isInitial`, "Terminal" (red pill) if `isTerminal`
  - Edit icon (opens Edit State dialog)
  - Delete icon (with confirmation, only if no transitions reference this state)
  - Clicking a state card highlights it in the diagram

**Add/Edit State Dialog**:

- **Add API**: `POST /api/v1/workflow-definitions/:id/states`
- **Edit API**: `PATCH /api/v1/workflow-definitions/:id/states/:stateId`
- **Delete API**: `DELETE /api/v1/workflow-definitions/:id/states/:stateId`
- Fields:
  - Name (required, 1–100 chars)
  - Description (optional)
  - Is Initial (checkbox) — only one state can be initial; warn if another is already initial
  - Is Terminal (checkbox)
  - Color (color picker for `metadata.color` — 6 preset colors + custom hex)
  - Icon (icon picker — choose from: `clock`, `check`, `x`, `alert`, `star`, `flag`)

**Transitions Section**:

- Heading "Transitions" + "Add Transition" button
- List of transition cards:
  - Transition name
  - "`{fromStateName}` → `{toStateName}`" subtitle
  - "Comment required" chip if `requiresComment = true`
  - "Rules" count chip if there are rules
  - Edit icon, Delete icon
  - Clicking highlights it in the diagram

**Add Transition Dialog**:

- **API**: `POST /api/v1/workflow-definitions/:id/transitions`
- Fields:
  - Name (required)
  - From State (select — populated from states list)
  - To State (select — populated from states list, exclude same as from)
  - Allowed Roles (multi-select from `GET /api/v1/roles` list; empty = any role)
  - Requires Comment (toggle)
- On success: refresh transitions, optionally open the rules sub-panel

**Rules Sub-Panel** (appears when a transition card is clicked/expanded):

- Title: "Rules for `{transitionName}`"
- **API to list**: `GET /api/v1/workflow-definitions/:id/transitions/:transitionId/rules`
- Shows existing rules as cards (ruleName, evaluationOrder badge, ruleDefinition preview collapsed)
- "Add Rule" button → opens Rule Builder Dialog

**Rule Builder Dialog**:

- **API**: `POST /api/v1/workflow-definitions/:id/transitions/:transitionId/rules`
- Uses `ruleMetadata` (from `GET /api/v1/workflow-rules/metadata`) to power the UI
- Fields:
  - Rule Name (text input, required)
  - Evaluation Order (number, default 0)
  - Rule Type (radio: "Expression" | "Custom")

  **If Expression type**:
  - Logical operator: "ALL of these must pass" (all) | "ANY of these must pass" (any)
  - Condition builder — add multiple conditions, each row has:
    - Fact (dropdown: `payload` | `user` | `instance`)
    - Path (if fact = `payload`: text input prefilled with `$.`, hint shows available schema fields from `formSchema`. If fact = `user` or `instance`: dropdown from `ruleMetadata.systemPaths`)
    - Operator (dropdown from `ruleMetadata.expressionOperators`: equal, notEqual, lessThan, lessThanInclusive, greaterThan, greaterThanInclusive, in, notIn, contains, doesNotContain)
    - Value (text input, auto-converts to number if field type is number)
  - This builds the `ruleDefinition.all` or `ruleDefinition.any` array

  **If Custom type**:
  - Strategy (dropdown from `ruleMetadata.customStrategies`: `date-range-matches-days`, `user-has-any-role`)
  - Params (JSON editor — for `user-has-any-role`: show a roles multi-select input instead of raw JSON)

  **Schema Fields** (shown only if fact = `payload` is used):
  - "This rule references payload fields" section
  - For each payload path referenced, show a row to define the schema field:
    - Key (auto-filled from path, e.g. `amount`)
    - Type (select: `string`, `number`, `boolean`)
    - Label (text input, human-readable)
    - Required (checkbox)

  **Preview**: Show the generated `ruleDefinition` JSON in a collapsible code block at the bottom

**Right Panel (main area)**: Visual State Diagram

Using **ReactFlow**:

- Render each state as a custom node:
  - Rectangle with rounded corners
  - State name in bold
  - Color from `metadata.color` (default: use a role-based palette if no color)
  - "Initial" indicator: green left border or start arrow
  - "Terminal" indicator: double border or stop icon
  - Click → highlight in left sidebar
- Render each transition as an edge:
  - Arrow from fromState to toState
  - Label: transition name (small, truncated to 20 chars)
  - Animated edges for clarity
- Controls: zoom in/out, fit view, mini-map
- Positions: use `state.positionX` and `state.positionY` from the API. If null, use auto-layout (dagre or simple grid).
- When a state is added, update `positionX`/`positionY` via PATCH if the user drags it (only if draft).

#### Form Schema Tab

- Title: "Instance Form Schema"
- Subtitle: "These fields are collected when creating a workflow instance. They are populated automatically when you add rules that reference payload fields."
- Table showing the fields from `GET /api/v1/workflow-definitions/:id/instance-form-schema`:
  - Key, Type, Label, Required
- Empty state: "No form fields defined yet. Add rules with payload conditions to generate form fields."
- Read-only view — schema is populated from rule creation, not directly edited here

#### Versions Tab

- **API**: `GET /api/v1/workflow-definitions/:id/versions`
- Table of versions: Version number, Published By (user ID), Published At, Active badge
- Clicking a version → `GET /api/v1/workflow-definitions/:id/versions/:versionNumber` → show snapshot in a drawer/modal (read-only JSON viewer or structured view)

---

### Page 7: Workflow Instances List (`/instances`)

**API**: `GET /api/v1/workflow-instances?page=1&limit=20`

**Layout**:

- Page title "Instances" + "New Instance" button
- Filter bar:
  - Status filter (All / Active / Completed / Cancelled) — uses `?status=active` etc.
  - Workflow filter (select from definitions list) — uses `?workflowDefinitionId=`
  - Search (client-side, by `currentStateName` or `id`)
- Table:
  - Instance ID (first 8 chars + copy icon)
  - Workflow name (need to fetch definition names — batch or include in query)
  - Current State (with colored badge matching state metadata color if available)
  - Status badge
  - Version (v`{n}`)
  - Created by (user ID abbreviated)
  - Created At
  - Actions: "View" button → `/instances/:id`
- Pagination (page/limit, show total count)

**Create Instance Flow** (button → `/instances/new` or modal):

1. Step 1 — Select Workflow:
   - Show list of **published** workflow definitions only (`status=published`)
   - Card grid with workflow name, version, description
   - On select: fetch `GET /api/v1/workflow-definitions/:id/instance-form-schema`

2. Step 2 — Fill Form:
   - Render a dynamic form based on `formSchema.fields`
   - For each field: render appropriate input based on `type`:
     - `string` → text input
     - `number` → number input
     - `boolean` → toggle/checkbox
   - Required fields are validated before submit
   - Show field labels from `label`

3. Submit: `POST /api/v1/workflow-instances` with `{ workflowDefinitionId, payload: { ...formValues } }`
4. On success: navigate to `/instances/:id`

---

### Page 8: Instance Detail (`/instances/:id`)

This is the runtime execution page. It is the most important page for day-to-day users.

**On mount, fetch in parallel**:

1. `GET /api/v1/workflow-instances/:id` → instance detail
2. `GET /api/v1/workflow-instances/:id/allowed-transitions` → raw array (NOT wrapped)
3. `GET /api/v1/workflow-instances/:id/audit-logs?page=1&limit=20` → audit history

**Important**: Refetch (2) and (1) after every successful transition to get fresh state + new allowed actions.

#### Layout

**Top section** — Instance header:

- Instance ID (truncated + copy button)
- Workflow name + version pill
- Current state: large coloured badge (`currentStateName`)
- Status badge
- Created by + created at

**Middle section — two columns**:

**Left column (60%)**: Payload + Actions

_Payload card_:

- Title "Instance Data"
- Render the `payload` object as a readable key-value list (not raw JSON)
- Show each key with its label (if known from formSchema) or raw key if not
- Format numbers with commas, booleans as Yes/No

_Allowed Actions card_ (only if `status = active`):

- Title "Available Actions"
- For each allowed transition returned from `GET /allowed-transitions`:
  - A distinct action button with the transition name
  - If `requiresComment: true` → show "(Comment required)" below button
  - Button variant: primary for first option, outline for rest
- If empty array: "No actions available. This instance may be awaiting input from another role or has reached a terminal state."
- If status ≠ `active`: "This instance is `{status}` and can no longer be transitioned."
- "Cancel Instance" button (danger/outline, bottom, only if `status = active`) — with confirmation dialog

_Execute Transition Dialog_ (opens when an action button is clicked):

- Title: "Execute: `{transitionName}`"
- Shows: `{fromStateName}` → `{toStateName}` arrow visualization
- Comment textarea (required if `transition.requiresComment = true`, optional otherwise)
  - Label: "Comment `{(required)/(optional)}`"
  - Max 1000 characters, show character count
- Idempotency Key (hidden input, auto-generated UUID per dialog open, not shown to user but sent in body)
- "Execute Transition" button (primary)
- On click: `POST /api/v1/workflow-instances/:id/transitions` with body:
  ```json
  {
    "transitionId": "...",
    "lastKnownVersion": <current instance version>,
    "comment": "...",
    "idempotencyKey": "<auto-generated UUID>"
  }
  ```
- **Critical**: `lastKnownVersion` must be the current `instance.version`, not a hardcoded value
- On success: close dialog, show success toast "Transitioned to `{toStateName}`", refetch instance + allowed-transitions
- On 409 TRANSITION_CONFLICT: show error "This instance was updated by another user. Refreshing..." and refetch
- On 422 TRANSITION_RULES_FAILED: show error with failed rule names
- On 403 TRANSITION_ROLE_FORBIDDEN: show "You don't have permission to perform this action"

**Right column (40%)**: Audit Log Timeline

- Title "Activity Timeline"
- Vertically stacked timeline entries (newest first)
- Each entry:
  - Action icon (circle with action type icon):
    - `instance_created` → Plus icon, green
    - `transition_executed` → ArrowRight icon, blue
    - `instance_completed` → CheckCircle icon, green
    - `instance_cancelled` → XCircle icon, red
  - Actor email + role (snapshot)
  - Action label (human readable):
    - `instance_created` → "Instance created"
    - `transition_executed` → "`{fromState}` → `{toState}` via `{transitionName}`"
    - `instance_completed` → "Workflow completed"
    - `instance_cancelled` → "Instance cancelled"
  - Comment (if present, show in italics grey)
  - Timestamp (formatted: "Mar 5, 2026 at 10:30 AM")
- Load more button if there are more pages
- Show a subtle "eye" watermark on the timeline to indicate immutability

---

### Page 9: Users (`/users`)

**API**: `GET /api/v1/users?page=1&limit=20`

**Layout**:

- "Users" title + "Add User" button
- Table:
  - Name (full name)
  - Email
  - Roles (pills for each role)
  - Status (Active green dot / Inactive grey dot)
  - Last Login (formatted date or "Never")
  - Actions: "Assign Role" (shield icon), "Deactivate" (trash icon, with confirmation)
- Pagination

**Add User Dialog**:

- **API**: `POST /api/v1/users`
- Fields: First Name, Last Name, Email, Password, Role Names (multi-select from roles list, optional)
- After success: invalidate users query, show toast

**Assign Role Dialog** (inline per-user):

- **API**: `POST /api/v1/users/:id/roles` with `{ roleId: "uuid" }`
- Shows current roles + dropdown to select from available roles
- One-at-a-time assignment

**Deactivate**: `DELETE /api/v1/users/:id` — confirmation dialog "Deactivate `{name}`? They will no longer be able to log in."

---

### Page 10: Roles (`/roles`)

**APIs**: `GET /api/v1/roles` (list), `POST /api/v1/roles` (create)

**Layout**:

- "Roles" title + "Create Role" button
- Card grid of roles:
  - Role name
  - Description
  - "System Role" badge (read-only, grey) if `isSystemRole = true`
  - User count (if available from API)
- Empty custom roles state

**Create Role Dialog**:

- Fields: Name (required), Description (optional)
- Note shown: "System roles (Admin, Approver, Requestor, Viewer) are created automatically and cannot be deleted."

---

### Page 11: Tenant Settings (`/settings`)

**APIs**:

- `GET /api/v1/tenants/:id` → tenant info
- `GET /api/v1/tenants/:id/settings` → settings
- `PATCH /api/v1/tenants/:id` → update tenant
- `PATCH /api/v1/tenants/:id/settings` → update settings
- `GET /api/v1/tenants/:id/feature-flags` → flags list
- `PATCH /api/v1/tenants/:id/feature-flags/:key` → toggle flag

Use `user.tenantId` from Zustand store for all these calls.

**Layout — three cards**:

**Card 1: Tenant Info**

- Tenant Name (editable)
- Plan badge (free / pro / enterprise)
- Save button

**Card 2: Settings**

- Max Workflow Definitions (number input)
- Max Users (number input)
- Timezone (select dropdown — common timezones)
- Save button

**Card 3: Feature Flags**

- Table: Flag Key | Enabled toggle | Actions (Delete)
- Add flag inline form at bottom: key input + toggle + "Add" button
- Each toggle calls `PATCH /api/v1/tenants/:id/feature-flags/:key` with `{ isEnabled: boolean }`

---

### Page 12: Notification Templates (`/notifications`)

**APIs**:

- `GET /api/v1/notification-templates` — list
- `POST /api/v1/notification-templates` — create
- `PUT /api/v1/notification-templates/:id` — update
- `DELETE /api/v1/notification-templates/:id` — delete

**Layout**:

- Table: Template Name (event trigger), Channel (email/webhook badge), Active status
- Add/Edit dialog with fields:
  - Event Trigger (dropdown from known events: `workflow-execution.transition.completed`, `workflow-execution.instance.created`, etc.)
  - Channel (radio: Email / Webhook)
  - Subject Template (text input, only if email)
  - Body Template (textarea with monospace font — supports Handlebars syntax `{{variable}}`)
  - Is Active (toggle)

---

### Page 13: Webhook Configs (`/webhooks`)

**APIs**:

- `GET /api/v1/webhook-configs` — list
- `POST /api/v1/webhook-configs` — create
- `PUT /api/v1/webhook-configs/:id` — update
- `DELETE /api/v1/webhook-configs/:id` — delete

**Layout**:

- Table: Name, URL (truncated), Events (count pill), Active
- Add/Edit dialog with fields:
  - Name (required)
  - URL (required, must be valid URL)
  - Secret (required, used for HMAC signature verification — show/hide toggle)
  - Event Triggers (multi-select checkboxes: list of known NatsEvents)
  - Is Active (toggle)

---

## Global Components to Build

### `<StatusBadge status="active|completed|cancelled|draft|published|deprecated" />`

Consistent status display everywhere.

### `<CopyableId id="uuid-string" />`

Shows first 8 chars + copy icon. On click, copies full UUID and shows "Copied!" tooltip.

### `<EmptyState icon={...} title="..." description="..." action={...} />`

Reusable empty state component.

### `<ConfirmDialog title="..." description="..." onConfirm={...} />`

Wrapped `AlertDialog` from shadcn/ui for all destructive confirmations.

### `<LoadingSpinner />`

Centered spinner for page-level loading states.

### `<ErrorMessage error={...} />`

Parses API error responses. API errors come as:

```json
{
  "statusCode": 422,
  "errorCode": "TRANSITION_RULES_FAILED",
  "message": "...",
  "timestamp": "...",
  "path": "..."
}
```

Extract `errorCode` and `message` to show user-friendly error text.

### `<PageHeader title="..." subtitle="..." actions={...} />`

Consistent page header with breadcrumbs.

### `<DataTable columns={...} data={...} pagination={...} />`

Reusable TanStack Table (from `@tanstack/react-table`) component.

---

## Error Handling

All API errors follow this shape:

```typescript
interface ApiError {
  statusCode: number;
  errorCode: string; // from AppErrors enum
  message: string;
  timestamp: string;
  path: string;
}
```

Map known `errorCode` values to friendly messages:

```typescript
const errorMessages: Record<string, string> = {
  INVALID_CREDENTIALS: "Invalid email or password.",
  USER_INACTIVE: "Your account has been deactivated. Contact your admin.",
  TENANT_SLUG_TAKEN: "This company slug is already taken.",
  EMAIL_ALREADY_EXISTS: "An account with this email already exists.",
  TRANSITION_CONFLICT: "This workflow was updated by another user. Please refresh and try again.",
  TRANSITION_RULES_FAILED: "This transition could not be executed because one or more rules failed.",
  TRANSITION_ROLE_FORBIDDEN: "You don't have permission to perform this action.",
  COMMENT_REQUIRED: "A comment is required for this transition.",
  WORKFLOW_DEFINITION_NOT_DRAFT: "Only draft workflows can be modified.",
  MAX_USERS_REACHED: "You have reached the maximum number of users for your plan.",
  MAX_WORKFLOWS_REACHED: "You have reached the maximum number of workflows for your plan.",
};
```

Show errors via `sonner` or `react-hot-toast` toasts. Use:

- ✅ Green toast for success
- ❌ Red toast for errors
- ⚠️ Yellow toast for warnings (e.g., transitions that require attention)

---

## Key Business Logic Rules (Never Violate These)

1. **`POST /allowed-transitions` returns a raw array** — do not try to unwrap `response.data.data` on this endpoint
2. **Transition execution requires `lastKnownVersion`** — always read this from the current instance's `version` field. Never hardcode it.
3. **Login requires `tenantId` (UUID)**, not `tenantSlug`. The login form must have a `tenantId` field.
4. **`allowedRoleIds: []` means any role can execute** — do not interpret empty array as "no roles allowed"
5. **Workflow definitions can only be modified when `status = draft`** — show read-only warning for published/deprecated
6. **Only published definitions can be used to create instances** — filter definitions to `status = published` on the create instance page
7. **The form schema is not directly edited** — it is populated from rules that reference payload fields
8. **After a transition, instance `version` increments** — always re-fetch instance after transition before allowing next transition
9. **Audit logs are immutable** — no edit/delete UI
10. **Tenant context is always from JWT** — never ask user to provide tenantId for any action except login

---

## File Structure to Generate

```
src/
├── components/
│   ├── ui/                          ← shadcn/ui components
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── Topbar.tsx
│   ├── common/
│   │   ├── StatusBadge.tsx
│   │   ├── CopyableId.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── LoadingSpinner.tsx
│   │   ├── ErrorMessage.tsx
│   │   ├── PageHeader.tsx
│   │   └── DataTable.tsx
│   ├── workflow-designer/
│   │   ├── StateNode.tsx             ← ReactFlow custom node
│   │   ├── TransitionEdge.tsx        ← ReactFlow custom edge
│   │   ├── StatesPanel.tsx
│   │   ├── TransitionsPanel.tsx
│   │   ├── RuleBuilderDialog.tsx
│   │   ├── WorkflowDiagram.tsx
│   │   ├── FormSchemaTab.tsx
│   │   └── VersionsTab.tsx
│   └── instance/
│       ├── AllowedActionsCard.tsx
│       ├── ExecuteTransitionDialog.tsx
│       ├── AuditLogTimeline.tsx
│       └── PayloadCard.tsx
│
├── pages/
│   ├── auth/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterTenantPage.tsx
│   │   └── SelfRegisterPage.tsx
│   ├── DashboardPage.tsx
│   ├── WorkflowsPage.tsx
│   ├── WorkflowDesignerPage.tsx
│   ├── InstancesPage.tsx
│   ├── InstanceDetailPage.tsx
│   ├── CreateInstancePage.tsx
│   ├── UsersPage.tsx
│   ├── RolesPage.tsx
│   ├── SettingsPage.tsx
│   ├── NotificationsPage.tsx
│   └── WebhooksPage.tsx
│
├── stores/
│   ├── auth-store.ts
│   └── workflow-designer-store.ts
│
├── lib/
│   ├── api-client.ts
│   ├── api-helpers.ts
│   ├── query-client.ts
│   └── query-keys.ts
│
├── hooks/
│   ├── use-auth.ts
│   ├── use-workflow-definitions.ts
│   ├── use-workflow-designer.ts
│   ├── use-workflow-instances.ts
│   ├── use-users.ts
│   └── use-roles.ts
│
├── types/
│   └── api.ts                        ← All TypeScript types matching API schemas
│
├── utils/
│   ├── error-messages.ts
│   ├── format-date.ts
│   └── jwt.ts                        ← Decode JWT without library (atob)
│
├── App.tsx
└── main.tsx
```

---

## TypeScript Types (`src/types/api.ts`)

Define all types matching the API schemas:

```typescript
// Auth
export interface RegisterTenantRequest {
  tenantName: string;
  tenantSlug: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}
export interface RegisterTenantResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  tenant: { id: string; name: string; slug: string };
}
export interface LoginRequest {
  email: string;
  password: string;
  tenantId: string;
}
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

// Users
export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: RoleSummary[];
}
export interface RoleSummary {
  id: string;
  name: string;
  isSystemRole: boolean;
}
export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  roleNames?: string[];
}

// Roles
export interface Role {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isSystemRole: boolean;
  createdAt: string;
  updatedAt: string;
}

// Workflow Definitions
export interface WorkflowDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  currentVersion: number;
  status: "draft" | "published" | "deprecated";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface WorkflowState {
  id: string;
  tenantId: string;
  workflowDefinitionId: string;
  name: string;
  description: string | null;
  isInitial: boolean;
  isTerminal: boolean;
  positionX: number | null;
  positionY: number | null;
  metadata: { color?: string; icon?: string } | null;
  createdAt: string;
  updatedAt: string;
}
export interface WorkflowTransition {
  id: string;
  tenantId: string;
  workflowDefinitionId: string;
  name: string;
  fromStateId: string;
  toStateId: string;
  allowedRoleIds: string[];
  requiresComment: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface TransitionRule {
  id: string;
  tenantId: string;
  transitionId: string;
  ruleName: string;
  ruleDefinition: object;
  evaluationOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface FormSchemaField {
  key: string;
  type: string;
  label: string;
  required: boolean;
}

// Instances
export interface WorkflowInstance {
  id: string;
  tenantId: string;
  workflowDefinitionId: string;
  definitionVersion: number;
  currentStateId: string;
  currentStateName: string;
  payload: Record<string, unknown>;
  status: "active" | "completed" | "cancelled";
  version: number;
  createdBy: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AllowedTransition {
  id: string;
  name: string;
  fromStateId: string;
  toStateId: string;
  requiresComment: boolean;
  toStateName?: string;
}
export interface ExecuteTransitionRequest {
  transitionId: string;
  lastKnownVersion: number;
  comment?: string;
  idempotencyKey?: string;
}

// Audit
export interface AuditLog {
  id: string;
  tenantId: string;
  instanceId: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  actionType: string;
  transitionId: string | null;
  transitionName: string | null;
  fromState: string | null;
  toState: string | null;
  comment: string | null;
  eventId: string;
  occurredAt: string;
  createdAt: string;
}

// Rule Metadata
export interface RuleMetadata {
  facts: string[];
  ruleTypes: string[];
  customStrategies: string[];
  expressionOperators: string[];
  systemPaths: Array<{ fact: string; path: string; description: string }>;
  payloadPathFormat: string;
  expressionRuleDefinitionExample: object;
  customRuleDefinitionExample: object;
}
```

---

## How to Run This App Locally (Include in README.md)

After downloading from Lovable:

```bash
# 1. Install dependencies
npm install
# or if using bun:
bun install

# 2. Create environment file
cp .env.example .env
# Edit .env: set VITE_API_BASE_URL=https://eafe-103-182-11-183.ngrok-free.app
# Note: The ngrok URL changes periodically. Update VITE_API_BASE_URL when it does.

# 3. Start the development server
npm run dev
# or:
bun run dev

# 4. Open http://localhost:5173

# To build for production:
npm run build
npm run preview
```

Also create `.env.example`:

```
VITE_API_BASE_URL=https://your-api-url-here.ngrok-free.app
```

---

## Final Build Checklist for Lovable

- [ ] All routes implemented with proper protection (ProtectedRoute, AdminRoute)
- [ ] Auth store persisted to localStorage
- [ ] Token refresh interceptor implemented
- [ ] ngrok-skip-browser-warning header on all API calls
- [ ] All list endpoints use TanStack Query with proper query keys
- [ ] All mutations use TanStack Query `useMutation` with `onSuccess` cache invalidation
- [ ] `allowed-transitions` endpoint treated as raw array (no unwrapping)
- [ ] `lastKnownVersion` read from current instance on every transition
- [ ] ReactFlow diagram on workflow designer with custom nodes and edges
- [ ] Rule builder dialog uses live `ruleMetadata` from API
- [ ] Dynamic instance creation form from `instance-form-schema`
- [ ] Dark mode using grey-scale (zinc palette), not near-black
- [ ] Theme persisted to localStorage
- [ ] Status badges consistent across all pages
- [ ] Loading, error, and empty states on every data-fetching component
- [ ] Form validation with Zod schemas on all forms
- [ ] Error messages mapped from API `errorCode` to user-friendly text
- [ ] Idempotency key auto-generated (UUID) per transition dialog open
- [ ] README with local setup instructions
- [ ] .env.example file
