import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { NatsEvents } from '@app/shared/constants/nats-events.enum';
import {
  IWorkflowInstanceCreatedEvent,
  IWorkflowTransitionCompletedEvent,
  IWorkflowInstanceCancelledEvent,
} from '@app/shared/interfaces/events/workflow-events.interface';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { AuditActionType } from '../entities/audit-log.entity';

/**
 * Listens to workflow execution NATS events and persists immutable audit log entries.
 *
 * Every handler performs an idempotency check via `findByEventId` before writing.
 * This ensures safe replay and handles the case where the execution module already
 * wrote the entry atomically within its transaction (transition_executed, instance_cancelled).
 */
@Controller()
export class AuditSubscriber {
  private readonly logger = new Logger(AuditSubscriber.name);

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  @MessagePattern(NatsEvents.WORKFLOW_INSTANCE_CREATED)
  async onInstanceCreated(@Payload() data: IWorkflowInstanceCreatedEvent): Promise<void> {
    try {
      const existing = await this.auditLogRepository.findByEventId(data.eventId);
      if (existing) return;

      await this.auditLogRepository.insert({
        tenantId: data.tenantId,
        instanceId: data.instanceId,
        actorId: data.createdByUserId,
        actorEmail: '',   // not available in this event — populated by execution module on sync writes
        actorRole: '',
        actionType: AuditActionType.INSTANCE_CREATED,
        transitionId: null,
        transitionName: null,
        fromState: null,
        toState: data.initialState,
        comment: null,
        ipAddress: null,
        userAgent: null,
        eventId: data.eventId,
      });

      this.logger.log(`Audit: INSTANCE_CREATED [instanceId=${data.instanceId}]`);
    } catch (err) {
      this.logger.error(`Audit failed: INSTANCE_CREATED [instanceId=${data.instanceId}]`, err);
    }
  }

  @MessagePattern(NatsEvents.WORKFLOW_TRANSITION_COMPLETED)
  async onTransitionCompleted(@Payload() data: IWorkflowTransitionCompletedEvent): Promise<void> {
    try {
      const existing = await this.auditLogRepository.findByEventId(data.eventId);
      if (existing) return; // already written within the execution transaction

      await this.auditLogRepository.insert({
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
      });

      this.logger.log(`Audit: TRANSITION_COMPLETED [instanceId=${data.instanceId}]`);
    } catch (err) {
      this.logger.error(`Audit failed: TRANSITION_COMPLETED [instanceId=${data.instanceId}]`, err);
    }
  }

  @MessagePattern(NatsEvents.WORKFLOW_INSTANCE_CANCELLED)
  async onInstanceCancelled(@Payload() data: IWorkflowInstanceCancelledEvent): Promise<void> {
    try {
      const existing = await this.auditLogRepository.findByEventId(data.eventId);
      if (existing) return; // already written within the execution transaction

      await this.auditLogRepository.insert({
        tenantId: data.tenantId,
        instanceId: data.instanceId,
        actorId: data.cancelledByUserId,
        actorEmail: '',
        actorRole: '',
        actionType: AuditActionType.INSTANCE_CANCELLED,
        transitionId: null,
        transitionName: null,
        fromState: null,
        toState: 'cancelled',
        comment: null,
        ipAddress: null,
        userAgent: null,
        eventId: data.eventId,
      });

      this.logger.log(`Audit: INSTANCE_CANCELLED [instanceId=${data.instanceId}]`);
    } catch (err) {
      this.logger.error(`Audit failed: INSTANCE_CANCELLED [instanceId=${data.instanceId}]`, err);
    }
  }
}

