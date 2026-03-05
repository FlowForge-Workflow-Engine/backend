import { Inject, Injectable, Logger } from "@nestjs/common";
import { JSONCodec, NatsConnection } from "nats";
import { NATS_CLIENT } from "../../../infra";
import { NatsEvents } from "@app/shared/constants/nats-events.enum";
import {
  IUserCreatedEvent,
  IUserDeactivatedEvent,
  IUserRolesUpdatedEvent,
} from "@app/shared/interfaces/events/auth-events.interface";

/**
 * Publishes auth/user domain events to NATS.
 * Only publishes — never subscribes.
 * Uses raw nats NatsConnection (no @nestjs/microservices dependency).
 */
@Injectable()
export class AuthPublisher {
  private readonly logger = new Logger(AuthPublisher.name);
  private readonly jc = JSONCodec();

  constructor(@Inject(NATS_CLIENT) private readonly natsClient: NatsConnection) {}

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
}
