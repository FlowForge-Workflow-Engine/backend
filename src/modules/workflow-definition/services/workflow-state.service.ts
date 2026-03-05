import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { WorkflowStateRepository } from "../repositories/workflow-state.repository";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowState } from "../entities/workflow-state.entity";
import { CreateWorkflowStateDto } from "../dto/create-workflow-state.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

@Injectable()
export class WorkflowStateService {
  private readonly logger = new Logger(WorkflowStateService.name);

  constructor(
    private readonly stateRepository: WorkflowStateRepository,
    private readonly definitionRepository: WorkflowDefinitionRepository,
    private readonly redis: RedisService
  ) {}

  async create(definitionId: string, dto: CreateWorkflowStateDto, tenantId: string): Promise<WorkflowState> {
    const definition = await this.definitionRepository.findByIdAndTenant(definitionId, tenantId);
    if (!definition) throw new NotFoundException(AppErrors.WORKFLOW_DEFINITION_NOT_FOUND);
    if (definition.status !== WorkflowDefinitionStatus.DRAFT) {
      throw new BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_DRAFT);
    }

    // Business rule: only one initial state per definition
    if (dto.isInitial) {
      const count = await this.stateRepository.countInitialStates(definitionId, tenantId);
      if (count > 0) throw new BadRequestException(AppErrors.WORKFLOW_MULTIPLE_INITIAL_STATES);
    }

    const state = this.stateRepository.create({
      workflowDefinitionId: definitionId,
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      isInitial: dto.isInitial ?? false,
      isTerminal: dto.isTerminal ?? false,
      positionX: dto.positionX ?? null,
      positionY: dto.positionY ?? null,
      metadata: dto.metadata ?? null,
    });

    const saved = await this.stateRepository.save(state);
    // Invalidate definition detail + states list (structure changed)
    await this.redis.del(
      CacheKeys.workflowDefinition(tenantId, definitionId),
      CacheKeys.workflowStates(tenantId, definitionId),
      CacheKeys.workflowDefinitionList(tenantId)
    );
    this.logger.log(`WorkflowState created: ${saved.id} [definition=${definitionId}]`);
    return saved;
  }

  async findAll(definitionId: string, tenantId: string): Promise<WorkflowState[]> {
    return this.stateRepository.findByDefinitionAndTenant(definitionId, tenantId);
  }

  async findById(id: string, tenantId: string): Promise<WorkflowState> {
    const state = await this.stateRepository.findByIdAndTenant(id, tenantId);
    if (!state) throw new NotFoundException(AppErrors.WORKFLOW_STATE_NOT_FOUND);
    return state;
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const state = await this.findById(id, tenantId);
    const definitionId = state.workflowDefinitionId;
    await this.stateRepository.remove(state);
    await this.redis.del(
      CacheKeys.workflowDefinition(tenantId, definitionId),
      CacheKeys.workflowStates(tenantId, definitionId),
      CacheKeys.workflowTransitions(tenantId, definitionId),
      CacheKeys.workflowDefinitionList(tenantId)
    );
  }
}
