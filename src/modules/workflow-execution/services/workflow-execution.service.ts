import { Injectable } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { WorkflowInstance } from "../entities/workflow-instance.entity";
import { CreateInstanceCommand } from "../commands/create-instance.command";
import { ExecuteTransitionCommand } from "../commands/execute-transition.command";
import { CancelInstanceCommand } from "../commands/cancel-instance.command";
import { GetInstanceDetailQuery, GetInstanceDetailResult } from "../queries/get-instance-detail.query";
import { GetInstanceListQuery, GetInstanceListResult } from "../queries/get-instance-list.query";
import {
  GetAllowedTransitionsQuery,
  GetAllowedTransitionsResult,
} from "../queries/get-allowed-transitions.query";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

/**
 * Thin facade service — dispatches all operations to CommandBus / QueryBus.
 * Controllers interact only with this service; they never import handlers directly.
 */
@Injectable()
export class WorkflowExecutionService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  createInstance(
    workflowDefinitionId: string,
    payload: Record<string, unknown>,
    actor: IJwtPayload
  ): Promise<WorkflowInstance> {
    return this.commandBus.execute(new CreateInstanceCommand(workflowDefinitionId, payload, actor));
  }

  executeTransition(
    instanceId: string,
    transitionId: string,
    expectedVersion: number,
    comment: string | undefined,
    actor: IJwtPayload,
    idempotencyKey?: string
  ): Promise<WorkflowInstance> {
    return this.commandBus.execute(
      new ExecuteTransitionCommand(instanceId, transitionId, expectedVersion, comment, actor, idempotencyKey)
    );
  }

  cancelInstance(instanceId: string, actor: IJwtPayload): Promise<WorkflowInstance> {
    return this.commandBus.execute(new CancelInstanceCommand(instanceId, actor));
  }

  getInstanceDetail(instanceId: string, tenantId: string): Promise<GetInstanceDetailResult> {
    return this.queryBus.execute(new GetInstanceDetailQuery(instanceId, tenantId));
  }

  getInstanceList(
    tenantId: string,
    page: number,
    limit: number,
    status?: WorkflowInstanceStatus,
    workflowDefinitionId?: string
  ): Promise<GetInstanceListResult> {
    return this.queryBus.execute(
      new GetInstanceListQuery(tenantId, page, limit, status, workflowDefinitionId)
    );
  }

  getAllowedTransitions(
    instanceId: string,
    tenantId: string,
    userRoles: string[]
  ): Promise<GetAllowedTransitionsResult> {
    return this.queryBus.execute(new GetAllowedTransitionsQuery(instanceId, tenantId, userRoles));
  }
}
