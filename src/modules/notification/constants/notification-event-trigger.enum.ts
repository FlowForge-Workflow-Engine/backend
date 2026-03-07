import { NatsEvents } from "@app/shared/constants/nats-events.enum";

/**
 * Restricts notification templates to the events currently handled by NotificationSubscriber.
 * This keeps the template API aligned with actual subscriber coverage.
 */
export enum NotificationEventTrigger {
  TENANT_CREATED = NatsEvents.TENANT_CREATED,
  WORKFLOW_INSTANCE_CREATED = NatsEvents.WORKFLOW_INSTANCE_CREATED,
  WORKFLOW_TRANSITION_COMPLETED = NatsEvents.WORKFLOW_TRANSITION_COMPLETED,
  WORKFLOW_INSTANCE_COMPLETED = NatsEvents.WORKFLOW_INSTANCE_COMPLETED,
  WORKFLOW_INSTANCE_CANCELLED = NatsEvents.WORKFLOW_INSTANCE_CANCELLED,
}
