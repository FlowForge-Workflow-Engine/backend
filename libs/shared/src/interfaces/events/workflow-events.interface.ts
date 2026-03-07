export interface IWorkflowInstanceCreatedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly instanceId: string;
  readonly performedByUserId: string;
  readonly performedByEmail: string;
  readonly workflowDefinitionId: string;
  readonly initialState: string;
  readonly createdByUserId: string;
  readonly occurredAt: string;
}

export interface IWorkflowTransitionCompletedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly instanceId: string;
  readonly workflowDefinitionId: string;
  readonly fromState: string;
  readonly toState: string;
  readonly transitionId: string;
  readonly transitionName: string;
  readonly performedByUserId: string;
  readonly performedByEmail: string;
  readonly performedByRole: string;
  readonly comment?: string;
  readonly instancePayload: Record<string, unknown>;
  readonly occurredAt: string;
}

export interface IWorkflowInstanceCompletedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly instanceId: string;
  readonly performedByUserId: string;
  readonly performedByEmail: string;
  readonly workflowDefinitionId: string;
  readonly finalState: string;
  readonly occurredAt: string;
}

export interface IWorkflowInstanceCancelledEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly instanceId: string;
  readonly performedByUserId: string;
  readonly performedByEmail: string;
  readonly workflowDefinitionId: string;
  readonly cancelledByUserId: string;
  readonly occurredAt: string;
}

export interface IWorkflowDefinitionPublishedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly definitionId: string;
  readonly versionNumber: number;
  readonly publishedByUserId: string;
  readonly occurredAt: string;
}

export interface IWorkflowDefinitionDeprecatedEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly definitionId: string;
  readonly occurredAt: string;
}
