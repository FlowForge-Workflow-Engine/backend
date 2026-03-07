export interface ITenantCreatedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly plan: string;
  /** Founding admin user id, included when tenant creation originates from onboarding. */
  readonly adminUserId?: string;
  /** Founding admin email, included so notification subscribers can send welcome emails without cross-module reads. */
  readonly adminEmail?: string;
  /** Founding admin first name for welcome-email personalization. */
  readonly adminFirstName?: string;
  /** Founding admin last name for welcome-email personalization. */
  readonly adminLastName?: string;
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
