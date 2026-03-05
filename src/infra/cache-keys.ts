/**
 * Centralized Redis key builders.
 * All keys include a module prefix and tenantId for isolation.
 */
export const CacheKeys = {
  // ─── Auth ──────────────────────────────────────────────────────────────────
  userSummary: (tenantId: string, userId: string) => `wf-auth:${tenantId}:user:${userId}:summary`,

  userRoles: (tenantId: string, userId: string) => `wf-auth:${tenantId}:user:${userId}:roles`,

  usersByTenant: (tenantId: string) => `wf-auth:${tenantId}:users`,

  jwtUser: (tenantId: string, userId: string) => `wf-auth:${tenantId}:jwt:${userId}`,

  // ─── Tenant ────────────────────────────────────────────────────────────────
  tenantById: (tenantId: string) => `wf-tenant:${tenantId}:detail`,

  tenantBySlug: (slug: string) => `wf-tenant:slug:${slug}:detail`,

  tenantSettings: (tenantId: string) => `wf-tenant:${tenantId}:settings`,

  tenantFeatureFlags: (tenantId: string) => `wf-tenant:${tenantId}:feature-flags`,

  tenantPlan: (tenantId: string) => `wf-tenant:${tenantId}:plan`,

  // ─── Workflow Definition ───────────────────────────────────────────────────
  workflowDefinition: (tenantId: string, definitionId: string) => `wf-def:${tenantId}:def:${definitionId}`,

  workflowDefinitionList: (tenantId: string) => `wf-def:${tenantId}:list`,

  workflowStates: (tenantId: string, definitionId: string) => `wf-def:${tenantId}:def:${definitionId}:states`,

  workflowTransitions: (tenantId: string, definitionId: string) =>
    `wf-def:${tenantId}:def:${definitionId}:transitions`,

  workflowVersionSnapshot: (tenantId: string, definitionId: string, version: number) =>
    `wf-def:${tenantId}:def:${definitionId}:snapshot:v${version}`,

  // ─── Workflow Execution ────────────────────────────────────────────────────
  allowedTransitions: (tenantId: string, instanceId: string) =>
    `wf-exec:${tenantId}:instance:${instanceId}:allowed-transitions`,

  instanceDetail: (tenantId: string, instanceId: string) =>
    `wf-exec:${tenantId}:instance:${instanceId}:detail`,

  transitionIdempotency: (tenantId: string, idempotencyKey: string) =>
    `wf-exec:${tenantId}:idempotency:${idempotencyKey}`,

  // ─── Notification ──────────────────────────────────────────────────────────
  notifTemplates: (tenantId: string, eventTrigger: string) =>
    `wf-notif:${tenantId}:templates:${eventTrigger}`,

  notifWebhooks: (tenantId: string, eventTrigger: string) => `wf-notif:${tenantId}:webhooks:${eventTrigger}`,

  // ─── Rate Limiting ─────────────────────────────────────────────────────────
  rateLimitUser: (tenantId: string, userId: string, windowMin: number) =>
    `wf-rl:${tenantId}:user:${userId}:${windowMin}`,

  rateLimitTenant: (tenantId: string, windowMin: number) => `wf-rl:${tenantId}:global:${windowMin}`,
} as const;
