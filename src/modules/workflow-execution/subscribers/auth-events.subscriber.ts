import { Controller, Logger, OnModuleInit } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { NatsEvents } from '@app/shared/constants/nats-events.enum';
import {
  IUserCreatedEvent,
  IUserDeactivatedEvent,
  IUserRolesUpdatedEvent,
} from '@app/shared/interfaces/events/auth-events.interface';
import { UserShadowRepository } from '../repositories/user-shadow.repository';

/**
 * Subscribes to Auth domain events to keep the `we_user_shadows` table
 * in sync (Pattern 3 — Shadow Read Model).
 *
 * All handlers are idempotent — safe to replay on duplicate delivery.
 */
@Controller()
export class AuthEventsSubscriber implements OnModuleInit {
  private readonly logger = new Logger(AuthEventsSubscriber.name);

  constructor(private readonly shadowRepo: UserShadowRepository) {}

  onModuleInit() {
    this.logger.log('AuthEventsSubscriber initialized — listening to auth events');
  }

  @MessagePattern(NatsEvents.USER_CREATED)
  async onUserCreated(@Payload() data: IUserCreatedEvent): Promise<void> {
    try {
      await this.shadowRepo.upsert({
        id: data.userId,
        tenantId: data.tenantId,
        email: data.email,
        fullName: `${data.firstName} ${data.lastName}`.trim(),
        roles: data.roles,
        isActive: true,
        syncedAt: new Date(data.occurredAt),
      });
      this.logger.log(`Shadow synced: USER_CREATED [userId=${data.userId}]`);
    } catch (err) {
      this.logger.error(`Failed to sync USER_CREATED [userId=${data.userId}]`, err);
    }
  }

  @MessagePattern(NatsEvents.USER_DEACTIVATED)
  async onUserDeactivated(@Payload() data: IUserDeactivatedEvent): Promise<void> {
    try {
      await this.shadowRepo.deactivate(data.userId, new Date(data.occurredAt));
      this.logger.log(`Shadow synced: USER_DEACTIVATED [userId=${data.userId}]`);
    } catch (err) {
      this.logger.error(`Failed to sync USER_DEACTIVATED [userId=${data.userId}]`, err);
    }
  }

  @MessagePattern(NatsEvents.USER_ROLES_UPDATED)
  async onUserRolesUpdated(@Payload() data: IUserRolesUpdatedEvent): Promise<void> {
    try {
      await this.shadowRepo.updateRoles(data.userId, data.roles, new Date(data.occurredAt));
      this.logger.log(`Shadow synced: USER_ROLES_UPDATED [userId=${data.userId}]`);
    } catch (err) {
      this.logger.error(`Failed to sync USER_ROLES_UPDATED [userId=${data.userId}]`, err);
    }
  }
}

