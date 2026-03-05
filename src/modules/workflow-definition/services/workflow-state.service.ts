import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { WorkflowStateRepository } from "../repositories/workflow-state.repository";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowState } from "../entities/workflow-state.entity";
import { CreateWorkflowStateDto } from "../dto/create-workflow-state.dto";
import { FindWorkflowStateDto } from "../dto/find-workflow-state.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

/**
 * Service for managing workflow states within a definition.
 * States represent the different stages a workflow instance can be in.
 * Only DRAFT definitions can be modified; published definitions are immutable.
 *
 * Responsibilities:
 * - Create, read, remove workflow states
 * - Enforce business rules (only one initial state per definition)
 * - Invalidate caches on mutations
 */
@Injectable()
export class WorkflowStateService {
  private readonly logger = new Logger(WorkflowStateService.name);

  constructor(
    private readonly stateRepository: WorkflowStateRepository,
    private readonly definitionRepository: WorkflowDefinitionRepository,
    private readonly redis: RedisService
  ) {}

  /**
   * Creates a new workflow state within a definition.
   * Only DRAFT definitions can have states added.
   * Enforces business rule: only one initial state per definition.
   * Invalidates definition and states caches after creation.
   *
   * @param definitionId - The workflow definition ID
   * @param dto - State creation data (name, description, isInitial, isTerminal, position, metadata)
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowState> - The created state entity
   * @throws NotFoundException - If definition not found
   * @throws BadRequestException - If definition is not DRAFT or multiple initial states
   */
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

  /**
   * Retrieves paginated states for a workflow definition.
   *
   * @param dto - Pagination parameters
   * @param definitionId - The workflow definition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowState[]> - Paginated states for the definition
   */
  async findAll(dto: FindWorkflowStateDto, definitionId: string, tenantId: string): Promise<WorkflowState[]> {
    const { page, limit } = dto;
    return this.stateRepository.findByDefinitionAndTenant(definitionId, tenantId, { page, limit });
  }

  /**
   * Retrieves a single workflow state by ID.
   *
   * @param id - The workflow state ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowState> - The state entity
   * @throws NotFoundException - If state not found
   */
  async findById(id: string, tenantId: string): Promise<WorkflowState> {
    const state = await this.stateRepository.findByIdAndTenant(id, tenantId);
    if (!state) throw new NotFoundException(AppErrors.WORKFLOW_STATE_NOT_FOUND);
    return state;
  }

  /**
   * Removes a workflow state from a definition.
   * Invalidates definition, states, and transitions caches since transitions depend on states.
   *
   * @param id - The workflow state ID to remove
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<void>
   * @throws NotFoundException - If state not found
   */
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
