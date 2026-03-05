import { Inject, Injectable, Logger } from '@nestjs/common';
import { JSONCodec, NatsConnection } from 'nats';
import { NatsEvents } from '@app/shared/constants/nats-events.enum';
import {
  IWorkflowDefinitionDeprecatedEvent,
  IWorkflowDefinitionPublishedEvent,
} from '@app/shared/interfaces/events/workflow-events.interface';
import { NATS_CLIENT } from '../../../infra';

@Injectable()
export class WorkflowDefinitionPublisher {
  private readonly logger = new Logger(WorkflowDefinitionPublisher.name);
  private readonly codec = JSONCodec();

  constructor(
    @Inject(NATS_CLIENT) private readonly nats: NatsConnection,
  ) {}

  publishWorkflowDefinitionPublished(
    payload: IWorkflowDefinitionPublishedEvent,
  ): void {
    try {
      this.nats.publish(
        NatsEvents.WORKFLOW_DEFINITION_PUBLISHED,
        this.codec.encode(payload),
      );
      this.logger.log(
        `Published ${NatsEvents.WORKFLOW_DEFINITION_PUBLISHED} for definition ${payload.definitionId} v${payload.versionNumber}`,
      );
    } catch (err: unknown) {
      this.logger.error('Failed to publish WORKFLOW_DEFINITION_PUBLISHED', err);
    }
  }

  publishWorkflowDefinitionDeprecated(
    payload: IWorkflowDefinitionDeprecatedEvent,
  ): void {
    try {
      this.nats.publish(
        NatsEvents.WORKFLOW_DEFINITION_DEPRECATED,
        this.codec.encode(payload),
      );
      this.logger.log(
        `Published ${NatsEvents.WORKFLOW_DEFINITION_DEPRECATED} for definition ${payload.definitionId}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        'Failed to publish WORKFLOW_DEFINITION_DEPRECATED',
        err,
      );
    }
  }
}

