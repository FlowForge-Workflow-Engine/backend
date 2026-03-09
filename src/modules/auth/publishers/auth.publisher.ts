import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { JSONCodec, NatsConnection } from "nats";
import { NATS_CLIENT } from "../../../infra";
import { NatsEvents } from "@app/shared/constants/nats-events.enum";
import {
  IUserCreatedEvent,
  IUserDeactivatedEvent,
  IUserRolesUpdatedEvent,
} from "@app/shared/interfaces/events/auth-events.interface";
import { ITenantCreatedEvent } from "@app/shared/interfaces/events/tenant-events.interface";

/**
 * Publishes auth/user domain events to NATS.
 * Only publishes — never subscribes.
 * Uses raw nats NatsConnection (no @nestjs/microservices dependency).
 */
@Injectable()
export class AuthPublisher implements OnModuleInit {
  private readonly logger = new Logger(AuthPublisher.name);
  private readonly jc = JSONCodec();

  constructor(@Inject(NATS_CLIENT) private readonly natsClient: NatsConnection) {}

  onModuleInit() {
    this.logger.log("AuthPublisher initialized — will publish NATS events for auth/user domain");
  }

  publishUserCreated(payload: IUserCreatedEvent): void {
    try {
      this.natsClient.publish(NatsEvents.USER_CREATED, this.jc.encode(payload));
      this.logger.log(`Published ${NatsEvents.USER_CREATED} [user=${payload.userId}]`);
    } catch (err) {
      this.logger.error(`Failed to publish ${NatsEvents.USER_CREATED}`, err);
    }
  }

  publishUserDeactivated(payload: IUserDeactivatedEvent): void {
    try {
      this.natsClient.publish(NatsEvents.USER_DEACTIVATED, this.jc.encode(payload));
      this.logger.log(`Published ${NatsEvents.USER_DEACTIVATED} [user=${payload.userId}]`);
    } catch (err) {
      this.logger.error(`Failed to publish ${NatsEvents.USER_DEACTIVATED}`, err);
    }
  }

  publishUserRolesUpdated(payload: IUserRolesUpdatedEvent): void {
    try {
      this.natsClient.publish(NatsEvents.USER_ROLES_UPDATED, this.jc.encode(payload));
      this.logger.log(`Published ${NatsEvents.USER_ROLES_UPDATED} [user=${payload.userId}]`);
    } catch (err) {
      this.logger.error(`Failed to publish ${NatsEvents.USER_ROLES_UPDATED}`, err);
    }
  }

  /**
   * Onboarding owns this publish path so the tenant-created event can carry founding-admin recipient details
   * needed by downstream notification subscribers without breaking module boundaries.
   */
  publishTenantCreated(payload: ITenantCreatedEvent): void {
    try {
      this.natsClient.publish(NatsEvents.TENANT_CREATED, this.jc.encode(payload));
      this.logger.log(`Published ${NatsEvents.TENANT_CREATED} [tenant=${payload.tenantId}]`);
    } catch (err) {
      this.logger.error(`Failed to publish ${NatsEvents.TENANT_CREATED}`, err);
    }
  }
}
