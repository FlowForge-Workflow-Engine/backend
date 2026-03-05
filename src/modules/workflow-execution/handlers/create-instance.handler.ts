import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AppErrors } from '@app/shared/constants/app-errors.enum';
import { generateUUID } from '@app/shared/utils/uuid.util';
import {
  IWorkflowQueryContract,
  WORKFLOW_QUERY_CONTRACT,
} from '@app/shared/interfaces/contracts/workflow-query.contract';
import { WorkflowInstanceRepository } from '../repositories/workflow-instance.repository';
import { WorkflowInstanceStatus } from '../entities/workflow-instance.entity';
import { ExecutionPublisher } from '../publishers/execution.publisher';
import { CreateInstanceCommand } from '../commands/create-instance.command';
import { WorkflowInstance } from '../entities/workflow-instance.entity';

@CommandHandler(CreateInstanceCommand)
export class CreateInstanceHandler implements ICommandHandler<CreateInstanceCommand> {
  constructor(
    private readonly instanceRepo: WorkflowInstanceRepository,
    @Inject(WORKFLOW_QUERY_CONTRACT)
    private readonly workflowQuery: IWorkflowQueryContract,
    private readonly publisher: ExecutionPublisher,
  ) {}

  async execute(command: CreateInstanceCommand): Promise<WorkflowInstance> {
    const { workflowDefinitionId, payload, actor } = command;
    const tenantId = actor.tenantId;

    const definition = await this.workflowQuery.findDefinitionById(workflowDefinitionId, tenantId);
    if (!definition) throw new NotFoundException(AppErrors.WORKFLOW_DEFINITION_NOT_FOUND);
    if (definition.status !== 'published') {
      throw new UnprocessableEntityException(AppErrors.WORKFLOW_DEFINITION_NOT_PUBLISHED);
    }

    const snapshot = await this.workflowQuery.getVersionSnapshot(
      workflowDefinitionId,
      definition.currentVersion - 1, // currentVersion was bumped after publish
      tenantId,
    );
    if (!snapshot) throw new NotFoundException(AppErrors.DEFINITION_VERSION_NOT_FOUND);

    const states = (snapshot['states'] as any[]) ?? [];
    const initialState = states.find((s) => s.isInitial === true);
    if (!initialState) {
      throw new UnprocessableEntityException(AppErrors.WORKFLOW_INITIAL_STATE_REQUIRED);
    }

    const instance = this.instanceRepo.create({
      tenantId,
      workflowDefinitionId,
      definitionVersion: definition.currentVersion - 1,
      currentStateId: initialState.id,
      currentStateName: initialState.name,
      payload: payload ?? {},
      status: WorkflowInstanceStatus.ACTIVE,
      version: 1,
      createdBy: actor.sub,
    });

    const saved = await this.instanceRepo.save(instance);

    this.publisher.publishInstanceCreated({
      eventId: generateUUID(),
      tenantId,
      instanceId: saved.id,
      workflowDefinitionId,
      initialState: initialState.name,
      createdByUserId: actor.sub,
      occurredAt: new Date().toISOString(),
    });

    return saved;
  }
}

