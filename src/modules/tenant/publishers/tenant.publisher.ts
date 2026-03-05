import { Inject, Injectable, Logger } from '@nestjs/common';
import { JSONCodec, NatsConnection } from 'nats';
import { NATS_CLIENT } from '../../../infra';
import { NatsEvents } from '@app/shared/constants/nats-events.enum';
import {
  ITenantCreatedEvent,
  ITenantDeactivatedEvent,
  ITenantPlanUpdatedEvent,
} from '@app/shared/interfaces/events/tenant-events.interface';

/**
 * Publishes tenant domain events to NATS.
 * Only publishes — never subscribes.
 * Uses raw nats NatsConnection (no @nestjs/microservices dependency).
 */
@Injectable()
export class TenantPublisher {
  private readonly logger = new Logger(TenantPublisher.name);
  private readonly jc = JSONCodec();

  constructor(
    @Inject(NATS_CLIENT) private readonly natsClient: NatsConnection,
  ) {}

  publishTenantCreated(payload: ITenantCreatedEvent): void {
    try {
      this.natsClient.publish(NatsEvents.TENANT_CREATED, this.jc.encode(payload));
      this.logger.log(`Published ${NatsEvents.TENANT_CREATED} [tenant=${payload.tenantId}]`);
    } catch (err) {
      this.logger.error(`Failed to publish ${NatsEvents.TENANT_CREATED}`, err);
    }
  }

  publishTenantDeactivated(payload: ITenantDeactivatedEvent): void {
    try {
      this.natsClient.publish(NatsEvents.TENANT_DEACTIVATED, this.jc.encode(payload));
      this.logger.log(`Published ${NatsEvents.TENANT_DEACTIVATED} [tenant=${payload.tenantId}]`);
    } catch (err) {
      this.logger.error(`Failed to publish ${NatsEvents.TENANT_DEACTIVATED}`, err);
    }
  }

  publishTenantPlanUpdated(payload: ITenantPlanUpdatedEvent): void {
    try {
      this.natsClient.publish(NatsEvents.TENANT_PLAN_UPDATED, this.jc.encode(payload));
      this.logger.log(`Published ${NatsEvents.TENANT_PLAN_UPDATED} [tenant=${payload.tenantId}]`);
    } catch (err) {
      this.logger.error(`Failed to publish ${NatsEvents.TENANT_PLAN_UPDATED}`, err);
    }
  }
}

