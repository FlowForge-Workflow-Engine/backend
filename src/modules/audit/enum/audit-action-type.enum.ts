export enum AuditActionType {
  USER_CREATED = "user_created",
  USER_DEACTIVATED = "user_deactivated",
  USER_ROLES_UPDATED = "user_roles_updated",

  TENANT_CREATED = "tenant_created",
  TENANT_DEACTIVATED = "tenant_deactivated",
  TENANT_PLAN_UPDATED = "tenant_plan_updated",

  INSTANCE_CREATED = "instance_created",
  INSTANCE_COMPLETED = "instance_completed",
  INSTANCE_CANCELLED = "instance_cancelled",

  TRANSITION_EXECUTED = "transition_executed",

  WORKFLOW_DEFINITION_PUBLISHED = "workflow_definition_published",
  WORKFLOW_DEFINITION_DEPRECATED = "workflow_definition_deprecated",
}
