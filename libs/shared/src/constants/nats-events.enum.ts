export enum NatsEvents {
  // Auth domain
  USER_CREATED = "auth.user.created",
  USER_DEACTIVATED = "auth.user.deactivated",
  USER_ROLES_UPDATED = "auth.user.roles-updated",

  // Tenant domain
  TENANT_CREATED = "tenant.created",
  TENANT_DEACTIVATED = "tenant.deactivated",
  TENANT_PLAN_UPDATED = "tenant.plan-updated",

  // Workflow Definition domain
  WORKFLOW_DEFINITION_PUBLISHED = "workflow-definition.published",
  WORKFLOW_DEFINITION_DEPRECATED = "workflow-definition.deprecated",

  // Workflow Execution domain
  WORKFLOW_INSTANCE_CREATED = "workflow-execution.instance.created",
  WORKFLOW_TRANSITION_COMPLETED = "workflow-execution.transition.completed",
  WORKFLOW_INSTANCE_COMPLETED = "workflow-execution.instance.completed",
  WORKFLOW_INSTANCE_CANCELLED = "workflow-execution.instance.cancelled",

  // Notification domain (internal triggers)
  NOTIFICATION_SEND_EMAIL = "notification.send.email",
  NOTIFICATION_WEBHOOK_TRIGGER = "notification.webhook.trigger",
}
