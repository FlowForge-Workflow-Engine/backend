## Workflow Execution API Walkthrough

This document explains the **actual API flow** implemented across:

- `src/modules/workflow-definition/`
- `src/modules/workflow-execution/`
- `src/modules/rule-engine/`

The example below uses a **Leave Approval Workflow** with these states:

- `Draft`
- `Pending Approval`
- `Under Review`
- `Approved`
- `Rejected`

---

## Response wrapper pattern used by this codebase

Most endpoints return one of these envelopes:

```json
{ "status": "success", "data": {} }
```

```json
{ "status": "success", "count": 1, "data": [] }
```

**Important:** `GET /workflow-instances/:id/allowed-transitions` currently returns a **raw array**, not `{ status, data }`.

---

## End-to-end API order

1. Create workflow definition
2. Create states
3. Create transitions
4. Attach transition rules
5. Publish the workflow
6. Create a workflow instance
7. Read instance details
8. Check allowed transitions
9. Execute transitions until terminal state

---

## 1) Create workflow definition

**API**: `POST /workflow-definitions`

**Request JSON**

```json
{
  "name": "Leave Approval Workflow",
  "description": "Handles employee leave requests end-to-end."
}
```

**Example response schema**

```json
{
  "status": "success",
  "data": {
    "id": "<workflowDefinitionId>",
    "tenantId": "<tenantId>",
    "name": "Leave Approval Workflow",
    "description": "Handles employee leave requests end-to-end.",
    "currentVersion": 0,
    "status": "draft",
    "createdBy": "<userId>",
    "createdAt": "2026-03-06T10:00:00.000Z",
    "updatedAt": "2026-03-06T10:00:00.000Z"
  }
}
```

---

## 2) Create states

**API**: `POST /workflow-definitions/:id/states`

Call this API once per state.

**Request JSON examples**

```json
{ "name": "Draft", "isInitial": true, "metadata": { "icon": "clock", "color": "#FF5733" } }
```

```json
{ "name": "Pending Approval", "metadata": { "icon": "user-check", "color": "#FFC300" } }
```

```json
{ "name": "Under Review", "metadata": { "icon": "search", "color": "#3498DB" } }
```

```json
{ "name": "Approved", "isTerminal": true, "metadata": { "icon": "check", "color": "#2ECC71" } }
```

```json
{ "name": "Rejected", "isTerminal": true, "metadata": { "icon": "x", "color": "#E74C3C" } }
```

**Example response schema**

```json
{
  "status": "success",
  "data": {
    "id": "<stateId>",
    "tenantId": "<tenantId>",
    "workflowDefinitionId": "<workflowDefinitionId>",
    "name": "Draft",
    "isInitial": true,
    "isTerminal": false,
    "description": null,
    "positionX": null,
    "positionY": null,
    "metadata": { "icon": "clock", "color": "#FF5733" },
    "createdAt": "2026-03-06T10:01:00.000Z",
    "updatedAt": "2026-03-06T10:01:00.000Z"
  }
}
```

---

## 3) Create transitions

**API**: `POST /workflow-definitions/:id/transitions`

Create these transitions in the draft workflow:

**Submit request**

```json
{
  "name": "Submit Request",
  "fromStateId": "<draftStateId>",
  "toStateId": "<pendingApprovalStateId>",
  "allowedRoleIds": [],
  "requiresComment": false
}
```

**Approve short leave**

```json
{
  "name": "Approve Short Leave",
  "fromStateId": "<pendingApprovalStateId>",
  "toStateId": "<approvedStateId>",
  "allowedRoleIds": ["<managerRoleId>"],
  "requiresComment": false
}
```

**Send to HR review**

```json
{
  "name": "Send to HR Review",
  "fromStateId": "<pendingApprovalStateId>",
  "toStateId": "<underReviewStateId>",
  "allowedRoleIds": ["<managerRoleId>"],
  "requiresComment": true
}
```

**Approve after review**

```json
{
  "name": "Approve After Review",
  "fromStateId": "<underReviewStateId>",
  "toStateId": "<approvedStateId>",
  "allowedRoleIds": ["<hrRoleId>"],
  "requiresComment": false
}
```

**Reject request**

```json
{
  "name": "Reject Request",
  "fromStateId": "<pendingApprovalStateId>",
  "toStateId": "<rejectedStateId>",
  "allowedRoleIds": ["<managerRoleId>"],
  "requiresComment": true
}
```

**Example response schema**

```json
{
  "status": "success",
  "data": {
    "id": "<transitionId>",
    "tenantId": "<tenantId>",
    "workflowDefinitionId": "<workflowDefinitionId>",
    "name": "Submit Request",
    "fromStateId": "<draftStateId>",
    "toStateId": "<pendingApprovalStateId>",
    "allowedRoleIds": [],
    "requiresComment": false,
    "createdAt": "2026-03-06T10:02:00.000Z",
    "updatedAt": "2026-03-06T10:02:00.000Z"
  }
}
```

**Meaning of `allowedRoleIds: []`**: open to everyone.

---

## 4) Attach transition rules

**API**: `POST /workflow-definitions/:id/transitions/:transitionId/rules`

Attach a rule to `Approve Short Leave` so it only works when `payload.days <= 7`:

```json
{
  "ruleName": "days-less-than-or-equal-7",
  "ruleDefinition": {
    "all": [
      { "fact": "payload", "path": "$.days", "operator": "lessThanInclusive", "value": 7 }
    ]
  },
  "evaluationOrder": 0
}
```

Attach a rule to `Send to HR Review` so it works when `payload.days > 7`:

```json
{
  "ruleName": "days-greater-than-7",
  "ruleDefinition": {
    "all": [
      { "fact": "payload", "path": "$.days", "operator": "greaterThan", "value": 7 }
    ]
  },
  "evaluationOrder": 0
}
```

**Example response schema**

```json
{
  "status": "success",
  "data": {
    "id": "<ruleId>",
    "tenantId": "<tenantId>",
    "transitionId": "<transitionId>",
    "ruleName": "days-greater-than-7",
    "ruleDefinition": {
      "all": [{ "fact": "payload", "path": "$.days", "operator": "greaterThan", "value": 7 }]
    },
    "evaluationOrder": 0,
    "createdAt": "2026-03-06T10:03:00.000Z",
    "updatedAt": "2026-03-06T10:03:00.000Z"
  }
}
```

---

## 5) Publish the workflow

**API**: `POST /workflow-definitions/:id/publish`

**Request JSON**: no body

**Example response schema**

```json
{
  "status": "success",
  "data": {
    "id": "<versionId>",
    "tenantId": "<tenantId>",
    "workflowDefinitionId": "<workflowDefinitionId>",
    "versionNumber": 1,
    "snapshot": {
      "id": "<workflowDefinitionId>",
      "name": "Leave Approval Workflow",
      "states": [{ "id": "<draftStateId>", "name": "Draft", "isInitial": true }],
      "transitions": [{ "id": "<submitTransitionId>", "name": "Submit Request", "rules": [] }]
    },
    "isActive": true,
    "publishedBy": "<userId>",
    "publishedAt": "2026-03-06T10:04:00.000Z",
    "createdAt": "2026-03-06T10:04:00.000Z",
    "updatedAt": "2026-03-06T10:04:00.000Z"
  }
}
```

After publish, runtime instances use this **immutable snapshot**. Later definition edits do not affect already-created instances.

---

## 6) Create a workflow instance

**API**: `POST /workflow-instances`

**Request JSON**

```json
{
  "workflowDefinitionId": "<workflowDefinitionId>",
  "payload": {
    "employeeId": "EMP-1001",
    "employeeName": "Debi Prasad",
    "leaveType": "annual",
    "startDate": "2026-03-20",
    "endDate": "2026-03-29",
    "days": 10,
    "reason": "Family trip"
  }
}
```

**Example response schema**

```json
{
  "status": "success",
  "data": {
    "id": "<instanceId>",
    "tenantId": "<tenantId>",
    "workflowDefinitionId": "<workflowDefinitionId>",
    "definitionVersion": 1,
    "currentStateId": "<draftStateId>",
    "currentStateName": "Draft",
    "payload": { "days": 10, "employeeId": "EMP-1001" },
    "status": "active",
    "version": 1,
    "createdBy": "<userId>",
    "completedAt": null,
    "createdAt": "2026-03-06T10:05:00.000Z",
    "updatedAt": "2026-03-06T10:05:00.000Z"
  }
}
```

---

## 7) Read instance details

**API**: `GET /workflow-instances/:id`

**Request JSON**: no body

**Example response schema**: same shape as create-instance response.

---

## 8) Check allowed transitions

**API**: `GET /workflow-instances/:id/allowed-transitions`

**Request JSON**: no body

**Example response schema**

```json
[
  {
    "id": "<submitTransitionId>",
    "name": "Submit Request",
    "toStateId": "<pendingApprovalStateId>",
    "toStateName": "Pending Approval",
    "requiresComment": false,
    "allowedRoleIds": []
  }
]
```

### Important behavior

- This API checks **current state + user roles**.
- It does **not** evaluate transition rules.
- So a transition can appear here and still fail later during execution if its rule does not pass.

---

## 9) Execute transition: Draft -> Pending Approval

**API**: `POST /workflow-instances/:id/transitions`

**Request JSON**

```json
{
  "transitionId": "<submitTransitionId>",
  "expectedVersion": 1,
  "comment": "Submitting leave request",
  "idempotencyKey": "leave-req-001-submit"
}
```

**Example response schema**

```json
{
  "status": "success",
  "data": {
    "id": "<instanceId>",
    "currentStateId": "<pendingApprovalStateId>",
    "currentStateName": "Pending Approval",
    "status": "active",
    "version": 2,
    "completedAt": null
  }
}
```

---

## 10) Execute transition with rule-engine participation

At `Pending Approval`, if the actor is a manager, `GET /allowed-transitions` can show both:

- `Approve Short Leave`
- `Send to HR Review`

Because our payload has `days = 10`, the correct transition is `Send to HR Review`.

**Request JSON**

```json
{
  "transitionId": "<sendToHrReviewTransitionId>",
  "expectedVersion": 2,
  "comment": "More than 7 days, sending for HR review",
  "idempotencyKey": "leave-req-001-hr-review"
}
```

**Example response schema**

```json
{
  "status": "success",
  "data": {
    "id": "<instanceId>",
    "currentStateId": "<underReviewStateId>",
    "currentStateName": "Under Review",
    "status": "active",
    "version": 3,
    "completedAt": null
  }
}
```

### What the rule engine evaluates here

- `payload.days`
- `user.id`, `user.role`, `user.roles`
- `instance.currentState`, `instance.createdAt`

For `days-greater-than-7`, the engine checks `payload.days > 7`, so `10 > 7` passes.

---

## 11) Final approval

**API**: `POST /workflow-instances/:id/transitions`

**Request JSON**

```json
{
  "transitionId": "<approveAfterReviewTransitionId>",
  "expectedVersion": 3,
  "comment": "HR approved",
  "idempotencyKey": "leave-req-001-final-approve"
}
```

**Example response schema**

```json
{
  "status": "success",
  "data": {
    "id": "<instanceId>",
    "currentStateId": "<approvedStateId>",
    "currentStateName": "Approved",
    "status": "completed",
    "version": 4,
    "completedAt": "2026-03-06T10:08:00.000Z"
  }
}
```

When the destination state is terminal, runtime status becomes `completed`.

---

## Related APIs you may also use

- `GET /workflow-definitions`
- `GET /workflow-definitions/:id`
- `GET /workflow-definitions/:id/versions`
- `GET /workflow-definitions/:id/versions/:versionNumber`
- `GET /workflow-definitions/:id/states`
- `GET /workflow-definitions/:id/transitions`
- `GET /workflow-definitions/:id/transitions/:transitionId/rules`
- `GET /workflow-instances?page=1&limit=10&status=active&workflowDefinitionId=<workflowDefinitionId>`
- `POST /workflow-instances/:id/cancel`
- `POST /workflow-definitions/:id/deprecate`

## Core runtime idea

- `workflow-definition` is the design-time blueprint.
- `publish` freezes that blueprint into an immutable version snapshot.
- `workflow-execution` creates runtime instances from that published snapshot.
- `rule-engine` is only involved when a transition is executed, not when allowed transitions are listed.