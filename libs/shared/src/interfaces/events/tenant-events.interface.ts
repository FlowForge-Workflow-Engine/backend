export interface ITenantCreatedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly plan: string;
  readonly occurredAt: string;
}

export interface ITenantDeactivatedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly occurredAt: string;
}

export interface ITenantPlanUpdatedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly oldPlan: string;
  readonly newPlan: string;
  readonly occurredAt: string;
}

