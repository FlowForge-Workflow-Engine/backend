import { Controller, Logger } from "@nestjs/common";
import { EventPattern, Payload } from "@nestjs/microservices";
import { NatsEvents } from "@app/shared/constants/nats-events.enum";
import {
  IUserCreatedEvent,
  IUserDeactivatedEvent,
  IUserRolesUpdatedEvent,
} from "@app/shared/interfaces/events/auth-events.interface";
import {
  ITenantCreatedEvent,
  ITenantDeactivatedEvent,
  ITenantPlanUpdatedEvent,
} from "@app/shared/interfaces/events/tenant-events.interface";
import {
  IWorkflowDefinitionDeprecatedEvent,
  IWorkflowDefinitionPublishedEvent,
  IWorkflowInstanceCompletedEvent,
  IWorkflowInstanceCreatedEvent,
  IWorkflowTransitionCompletedEvent,
  IWorkflowInstanceCancelledEvent,
} from "@app/shared/interfaces/events/workflow-events.interface";
import { AuditLog } from "../entities/audit-log.entity";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AuditActionType } from "../enum/audit-action-type.enum";

/**
 * Listens to tenant-safe business NATS events and persists immutable audit log entries.
 *
 * Every handler performs an idempotency check via `findByEventId` before writing.
 * This ensures safe replay while keeping audit persistence owned by the audit module.
 */
@Controller()
export class AuditSubscriber {
  private readonly logger = new Logger(AuditSubscriber.name);

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  @EventPattern(NatsEvents.USER_CREATED)
  async onUserCreated(@Payload() data: IUserCreatedEvent): Promise<void> {
    // Persist a user creation event as an immutable audit record scoped to the tenant.
    await this.persistEvent(NatsEvents.USER_CREATED, data.eventId, data.tenantId, data.userId, {
      tenantId: data.tenantId,
      instanceId: null,
      actorId: null,
      actorEmail: null,
      actorRole: null,
      actionType: AuditActionType.USER_CREATED,
      transitionId: null,
      transitionName: null,
      fromState: null,
      toState: null,
      comment: null,
      ipAddress: null,
      userAgent: null,
      eventId: data.eventId,
      resourceType: "user",
      resourceId: data.userId,
      occurredAt: new Date(data.occurredAt),
      payload: this.snapshot(data),
    });
  }

  @EventPattern(NatsEvents.USER_DEACTIVATED)
  async onUserDeactivated(@Payload() data: IUserDeactivatedEvent): Promise<void> {
    // Persist user deactivation so replayed auth events still produce a single audit row.
    await this.persistEvent(NatsEvents.USER_DEACTIVATED, data.eventId, data.tenantId, data.userId, {
      tenantId: data.tenantId,
      instanceId: null,
      actorId: null,
      actorEmail: null,
      actorRole: null,
      actionType: AuditActionType.USER_DEACTIVATED,
      transitionId: null,
      transitionName: null,
      fromState: null,
      toState: null,
      comment: null,
      ipAddress: null,
      userAgent: null,
      eventId: data.eventId,
      resourceType: "user",
      resourceId: data.userId,
      occurredAt: new Date(data.occurredAt),
      payload: this.snapshot(data),
    });
  }

  @EventPattern(NatsEvents.USER_ROLES_UPDATED)
  async onUserRolesUpdated(@Payload() data: IUserRolesUpdatedEvent): Promise<void> {
    // Capture role changes as audit events for traceability of authorization changes.
    await this.persistEvent(NatsEvents.USER_ROLES_UPDATED, data.eventId, data.tenantId, data.userId, {
      tenantId: data.tenantId,
      instanceId: null,
      actorId: null,
      actorEmail: null,
      actorRole: null,
      actionType: AuditActionType.USER_ROLES_UPDATED,
      transitionId: null,
      transitionName: null,
      fromState: null,
      toState: null,
      comment: null,
      ipAddress: null,
      userAgent: null,
      eventId: data.eventId,
      resourceType: "user",
      resourceId: data.userId,
      occurredAt: new Date(data.occurredAt),
      payload: this.snapshot(data),
    });
  }

  @EventPattern(NatsEvents.TENANT_CREATED)
  async onTenantCreated(@Payload() data: ITenantCreatedEvent): Promise<void> {
    // Tenant lifecycle events are audited against the tenant resource itself.
    await this.persistEvent(NatsEvents.TENANT_CREATED, data.eventId, data.tenantId, data.tenantId, {
      tenantId: data.tenantId,
      instanceId: null,
      actorId: null,
      actorEmail: null,
      actorRole: null,
      actionType: AuditActionType.TENANT_CREATED,
      transitionId: null,
      transitionName: null,
      fromState: null,
      toState: null,
      comment: null,
      ipAddress: null,
      userAgent: null,
      eventId: data.eventId,
      resourceType: "tenant",
      resourceId: data.tenantId,
      occurredAt: new Date(data.occurredAt),
      payload: this.snapshot(data),
    });
  }

  @EventPattern(NatsEvents.TENANT_DEACTIVATED)
  async onTenantDeactivated(@Payload() data: ITenantDeactivatedEvent): Promise<void> {
    // Record tenant deactivation in the audit stream for compliance and operational reviews.
    await this.persistEvent(NatsEvents.TENANT_DEACTIVATED, data.eventId, data.tenantId, data.tenantId, {
      tenantId: data.tenantId,
      instanceId: null,
      actorId: null,
      actorEmail: null,
      actorRole: null,
      actionType: AuditActionType.TENANT_DEACTIVATED,
      transitionId: null,
      transitionName: null,
      fromState: null,
      toState: null,
      comment: null,
      ipAddress: null,
      userAgent: null,
      eventId: data.eventId,
      resourceType: "tenant",
      resourceId: data.tenantId,
      occurredAt: new Date(data.occurredAt),
      payload: this.snapshot(data),
    });
  }

  @EventPattern(NatsEvents.TENANT_PLAN_UPDATED)
  async onTenantPlanUpdated(@Payload() data: ITenantPlanUpdatedEvent): Promise<void> {
    // Plan changes are persisted as tenant-level audit entries with the full event snapshot.
    await this.persistEvent(NatsEvents.TENANT_PLAN_UPDATED, data.eventId, data.tenantId, data.tenantId, {
      tenantId: data.tenantId,
      instanceId: null,
      actorId: null,
      actorEmail: null,
      actorRole: null,
      actionType: AuditActionType.TENANT_PLAN_UPDATED,
      transitionId: null,
      transitionName: null,
      fromState: null,
      toState: null,
      comment: null,
      ipAddress: null,
      userAgent: null,
      eventId: data.eventId,
      resourceType: "tenant",
      resourceId: data.tenantId,
      occurredAt: new Date(data.occurredAt),
      payload: this.snapshot(data),
    });
  }

  @EventPattern(NatsEvents.WORKFLOW_DEFINITION_PUBLISHED)
  async onWorkflowDefinitionPublished(@Payload() data: IWorkflowDefinitionPublishedEvent): Promise<void> {
    // Persist workflow definition publication so version releases can be reconstructed later.
    await this.persistEvent(
      NatsEvents.WORKFLOW_DEFINITION_PUBLISHED,
      data.eventId,
      data.tenantId,
      data.definitionId,
      {
        tenantId: data.tenantId,
        instanceId: null,
        actorId: data.publishedByUserId,
        actorEmail: data.publishedByEmail,
        actorRole: data.publishedByRole,
        actionType: AuditActionType.WORKFLOW_DEFINITION_PUBLISHED,
        transitionId: null,
        transitionName: null,
        fromState: null,
        toState: null,
        comment: null,
        ipAddress: null,
        userAgent: null,
        eventId: data.eventId,
        resourceType: "workflow_definition",
        resourceId: data.definitionId,
        occurredAt: new Date(data.occurredAt),
        payload: this.snapshot(data),
      }
    );
  }

  @EventPattern(NatsEvents.WORKFLOW_DEFINITION_DEPRECATED)
  async onWorkflowDefinitionDeprecated(@Payload() data: IWorkflowDefinitionDeprecatedEvent): Promise<void> {
    // Persist definition deprecation to explain why new instances stopped using this definition.
    await this.persistEvent(
      NatsEvents.WORKFLOW_DEFINITION_DEPRECATED,
      data.eventId,
      data.tenantId,
      data.definitionId,
      {
        tenantId: data.tenantId,
        instanceId: null,
        actorId: null,
        actorEmail: null,
        actorRole: null,
        actionType: AuditActionType.WORKFLOW_DEFINITION_DEPRECATED,
        transitionId: null,
        transitionName: null,
        fromState: null,
        toState: null,
        comment: null,
        ipAddress: null,
        userAgent: null,
        eventId: data.eventId,
        resourceType: "workflow_definition",
        resourceId: data.definitionId,
        occurredAt: new Date(data.occurredAt),
        payload: this.snapshot(data),
      }
    );
  }

  @EventPattern(NatsEvents.WORKFLOW_INSTANCE_CREATED)
  async onInstanceCreated(@Payload() data: IWorkflowInstanceCreatedEvent): Promise<void> {
    // Persist workflow instance creation with the initial state captured as the destination state.
    await this.persistEvent(
      NatsEvents.WORKFLOW_INSTANCE_CREATED,
      data.eventId,
      data.tenantId,
      data.instanceId,
      {
        tenantId: data.tenantId,
        instanceId: data.instanceId,
        actorId: data.createdByUserId,
        actorEmail: data.performedByEmail,
        actorRole: data.performedByRole,
        actionType: AuditActionType.INSTANCE_CREATED,
        transitionId: null,
        transitionName: null,
        fromState: null,
        toState: data.initialState,
        comment: null,
        ipAddress: null,
        userAgent: null,
        eventId: data.eventId,
        resourceType: "workflow_instance",
        resourceId: data.instanceId,
        occurredAt: new Date(data.occurredAt),
        payload: this.snapshot(data),
      }
    );
  }

  @EventPattern(NatsEvents.WORKFLOW_TRANSITION_COMPLETED)
  async onTransitionCompleted(@Payload() data: IWorkflowTransitionCompletedEvent): Promise<void> {
    // Persist the executed transition so auditors can trace who moved the instance between states.
    await this.persistEvent(
      NatsEvents.WORKFLOW_TRANSITION_COMPLETED,
      data.eventId,
      data.tenantId,
      data.instanceId,
      {
        tenantId: data.tenantId,
        instanceId: data.instanceId,
        actorId: data.performedByUserId,
        actorEmail: data.performedByEmail,
        actorRole: data.performedByRole,
        actionType: AuditActionType.TRANSITION_EXECUTED,
        transitionId: data.transitionId,
        transitionName: data.transitionName,
        fromState: data.fromState,
        toState: data.toState,
        comment: data.comment ?? null,
        ipAddress: null,
        userAgent: null,
        eventId: data.eventId,
        resourceType: "workflow_instance",
        resourceId: data.instanceId,
        occurredAt: new Date(data.occurredAt),
        payload: this.snapshot(data),
      }
    );
  }

  @EventPattern(NatsEvents.WORKFLOW_INSTANCE_COMPLETED)
  async onInstanceCompleted(@Payload() data: IWorkflowInstanceCompletedEvent): Promise<void> {
    // Record terminal completion as a separate audit event in addition to the transition event.
    await this.persistEvent(
      NatsEvents.WORKFLOW_INSTANCE_COMPLETED,
      data.eventId,
      data.tenantId,
      data.instanceId,
      {
        tenantId: data.tenantId,
        instanceId: data.instanceId,
        actorId: data.performedByUserId,
        actorEmail: data.performedByEmail,
        actorRole: data.performedByRole,
        actionType: AuditActionType.INSTANCE_COMPLETED,
        transitionId: data.transitionId,
        transitionName: data.transitionName,
        fromState: data.fromState,
        toState: data.finalState,
        comment: data.comment ?? null,
        ipAddress: null,
        userAgent: null,
        eventId: data.eventId,
        resourceType: "workflow_instance",
        resourceId: data.instanceId,
        occurredAt: new Date(data.occurredAt),
        payload: this.snapshot(data),
      }
    );
  }

  @EventPattern(NatsEvents.WORKFLOW_INSTANCE_CANCELLED)
  async onInstanceCancelled(@Payload() data: IWorkflowInstanceCancelledEvent): Promise<void> {
    // Persist cancellation as a workflow instance audit entry with the synthetic cancelled state.
    await this.persistEvent(
      NatsEvents.WORKFLOW_INSTANCE_CANCELLED,
      data.eventId,
      data.tenantId,
      data.instanceId,
      {
        tenantId: data.tenantId,
        instanceId: data.instanceId,
        actorId: data.cancelledByUserId,
        actorEmail: null,
        actorRole: null,
        actionType: AuditActionType.INSTANCE_CANCELLED,
        transitionId: null,
        transitionName: null,
        fromState: null,
        toState: "cancelled",
        comment: null,
        ipAddress: null,
        userAgent: null,
        eventId: data.eventId,
        resourceType: "workflow_instance",
        resourceId: data.instanceId,
        occurredAt: new Date(data.occurredAt),
        payload: this.snapshot(data),
      }
    );
  }

  /**
   * Persists a single audit entry for an incoming business event.
   * Performs an idempotency check using the event ID before inserting.
   *
   * @param eventName - NATS event name used for logging
   * @param eventId - Unique event identifier for idempotency
   * @param tenantId - Tenant scope for the audit entry
   * @param resourceIdForLog - Resource identifier used in operational log messages
   * @param entry - Audit log payload to persist
   * @returns Promise<void>
   */
  private async persistEvent(
    eventName: NatsEvents,
    eventId: string,
    tenantId: string,
    resourceIdForLog: string,
    entry: Partial<AuditLog>
  ): Promise<void> {
    try {
      // Run the idempotency check and insert on one tenant-scoped DB connection.
      const inserted = await this.auditLogRepository.insertIfAbsent(eventId, tenantId, entry);
      if (!inserted) return;

      // Emit a lightweight operational log entry only when a new audit row was persisted.
      this.logger.log(`Audit: ${eventName} [resourceId=${resourceIdForLog}]`);
    } catch (err) {
      // Subscriber errors are logged but not re-thrown so event consumption can continue safely.
      this.logger.error(`Audit failed: ${eventName} [resourceId=${resourceIdForLog}]`, err);
    }
  }

  /**
   * Creates a shallow serializable snapshot of the incoming event payload.
   *
   * @param data - Event payload received from NATS
   * @returns Record<string, unknown> - Snapshot stored in the audit record
   */
  private snapshot<T extends object>(data: T): Record<string, unknown> {
    return { ...(data as Record<string, unknown>) };
  }
}
