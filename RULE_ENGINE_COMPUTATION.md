## Rule Engine Computation

### What happens now

When `execute-transition.handler.ts` calls `this.ruleEngine.evaluateRules(transition.rules, context)`, the rule engine now supports:

- **Field-value rules** through expression-based `json-rules-engine` conditions
- **User-role rules** through expression-based rules over `user.role` / `user.roles`
- **Custom logic** through a pluggable custom-strategy evaluator

The runtime context passed into the engine is:

- `payload`
- `user.id`
- `user.role`
- `user.roles`
- `instance.currentState`
- `instance.createdAt`

### Important runtime fix

Published workflow snapshots store transition rules as:

- `ruleDefinition`

The evaluator now reads that exact property directly.

Before this fix, the evaluator expected `conditions`, which did not match the snapshot shape.

---

### Execution flow

1. `ExecuteTransitionHandler` loads the immutable workflow snapshot
2. It finds the matching transition from the current state
3. It builds runtime context from:
   - instance payload
   - authenticated actor
   - current instance metadata
4. It calls `ruleEngine.evaluateRules(transition.rules, context)`
5. `RuleEngineService` sorts rules by `evaluationOrder`
6. For each rule:
   - if `ruleDefinition.type === "custom"`, it delegates to `CustomRuleEvaluator`
   - otherwise it delegates to `ConditionEvaluator` as an expression rule
7. All failures are aggregated and returned to `ExecuteTransitionHandler`
8. If any rule fails, transition execution is rejected with `TRANSITION_RULES_FAILED`

---

### Example 1 — Field-value rule using your snapshot

Your snapshot rule:

<augment_code_snippet mode="EXCERPT">
````json
{
  "ruleName": "days-greater-than-7",
  "ruleDefinition": {
    "all": [{ "fact": "payload", "path": "$.days", "operator": "greaterThan", "value": 7 }]
  }
}
````
</augment_code_snippet>

If instance payload is:

<augment_code_snippet mode="EXCERPT">
````json
{ "days": 10 }
````
</augment_code_snippet>

Result:

- fact source = `payload`
- resolved value = `10`
- check = `10 > 7`
- rule passes
- transition continues

If payload is `{ "days": 5 }`:

- resolved value = `5`
- check = `5 > 7`
- rule fails
- transition is rejected

---

### Example 2 — User-role rule as an expression rule

Example rule:

<augment_code_snippet mode="EXCERPT">
````json
{
  "ruleName": "only-manager-can-submit",
  "ruleDefinition": {
    "all": [{ "fact": "user", "path": "$.role", "operator": "equal", "value": "manager" }]
  }
}
````
</augment_code_snippet>

If runtime context contains:

<augment_code_snippet mode="EXCERPT">
````json
{ "user": { "role": "manager", "roles": ["manager"] } }
````
</augment_code_snippet>

Result:

- resolved value = `manager`
- check = `manager === manager`
- rule passes

If runtime context contains `role = employee`, the rule fails.

---

### Example 3 — User-role rule as custom logic

Example custom rule:

<augment_code_snippet mode="EXCERPT">
````json
{
  "ruleName": "reviewer-role-required",
  "ruleDefinition": {
    "type": "custom",
    "strategy": "user-has-any-role",
    "params": { "roles": ["reviewer", "admin"] }
  }
}
````
</augment_code_snippet>

Computation:

1. Rule engine detects `type = custom`
2. It dispatches to strategy `user-has-any-role`
3. Strategy checks whether `context.user.roles` intersects with `params.roles`
4. If yes, pass; otherwise fail with a detailed reason

---

### Example 4 — Custom business logic for leave requests

Example custom rule:

<augment_code_snippet mode="EXCERPT">
````json
{
  "ruleName": "leave-days-must-match-date-range",
  "ruleDefinition": {
    "type": "custom",
    "strategy": "date-range-matches-days",
    "params": {
      "startDateField": "startDate",
      "endDateField": "endDate",
      "daysField": "days"
    }
  }
}
````
</augment_code_snippet>

If payload is:

<augment_code_snippet mode="EXCERPT">
````json
{ "startDate": "2026-03-10", "endDate": "2026-03-12", "days": 3 }
````
</augment_code_snippet>

Computation:

1. Read `payload.startDate`
2. Read `payload.endDate`
3. Read `payload.days`
4. Compute inclusive day count between the dates
5. Compare computed value to `days`
6. Pass if equal; fail if not equal

If `days = 2` for the same range, the rule fails.

---

### Recommended rule-authoring model

- Use **expression rules** for:
  - payload comparisons
  - user role / state comparisons
  - straightforward boolean logic

- Use **custom rules** for:
  - derived calculations
  - validations that need imperative logic
  - logic that should be encapsulated as named strategies

---

### Summary

The rule engine now handles all three categories:

- **Field values** → expression rules over `payload`
- **User role** → expression rules or custom strategies over `user`
- **Custom logic** → pluggable custom strategies inside `CustomRuleEvaluator`

Most importantly, it now evaluates the real published snapshot format by reading `ruleDefinition` directly.