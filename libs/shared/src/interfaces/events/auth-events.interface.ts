export interface IUserCreatedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: string[];
  readonly occurredAt: string;
}

export interface IUserDeactivatedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly occurredAt: string;
}

export interface IUserRolesUpdatedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly roles: string[];
  readonly occurredAt: string;
}
