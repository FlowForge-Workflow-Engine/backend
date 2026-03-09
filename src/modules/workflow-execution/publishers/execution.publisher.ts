import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { JSONCodec, NatsConnection } from "nats";
import { NATS_CLIENT } from "../../../infra";
import { NatsEvents } from "@app/shared/constants/nats-events.enum";
import {
  IWorkflowInstanceCreatedEvent,
  IWorkflowTransitionCompletedEvent,
  IWorkflowInstanceCompletedEvent,
  IWorkflowInstanceCancelledEvent,
} from "@app/shared/interfaces/events/workflow-events.interface";

@Injectable()
export class ExecutionPublisher implements OnModuleInit {
  private readonly logger = new Logger(ExecutionPublisher.name);
  private readonly jc = JSONCodec();

  constructor(@Inject(NATS_CLIENT) private readonly nats: NatsConnection) {}

  onModuleInit() {
    this.logger.log(
      "ExecutionPublisher initialized — will publish NATS events for workflow execution domain"
    );
  }

  publishInstanceCreated(payload: IWorkflowInstanceCreatedEvent): void {
    this.publish(NatsEvents.WORKFLOW_INSTANCE_CREATED, payload);
  }

  publishTransitionCompleted(payload: IWorkflowTransitionCompletedEvent): void {
    this.publish(NatsEvents.WORKFLOW_TRANSITION_COMPLETED, payload);
  }

  publishInstanceCompleted(payload: IWorkflowInstanceCompletedEvent): void {
    this.publish(NatsEvents.WORKFLOW_INSTANCE_COMPLETED, payload);
  }

  publishInstanceCancelled(payload: IWorkflowInstanceCancelledEvent): void {
    this.publish(NatsEvents.WORKFLOW_INSTANCE_CANCELLED, payload);
  }

  private publish(subject: string, payload: unknown): void {
    try {
      this.nats.publish(subject, this.jc.encode(payload));
      this.logger.log(`Published ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to publish ${subject}`, err);
    }
  }
}
