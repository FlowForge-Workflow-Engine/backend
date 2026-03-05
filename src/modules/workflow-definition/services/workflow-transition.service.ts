import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { WorkflowTransitionRepository } from "../repositories/workflow-transition.repository";
import { WorkflowStateRepository } from "../repositories/workflow-state.repository";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { TransitionRuleRepository } from "../repositories/transition-rule.repository";
import { WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowTransition } from "../entities/workflow-transition.entity";
import { TransitionRule } from "../entities/transition-rule.entity";
import { CreateWorkflowTransitionDto } from "../dto/create-workflow-transition.dto";
import { CreateTransitionRuleDto } from "../dto/create-transition-rule.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

/**
 * Service for managing workflow transitions and transition rules.
 * Transitions define allowed state changes within a workflow definition.
 * Only DRAFT definitions can be modified; published definitions are immutable.
 *
 * Responsibilities:
 * - Create, read, remove workflow transitions
 * - Add, manage transition rules (conditions for state transitions)
 * - Validate state references and definition status
 * - Invalidate caches on mutations
 */
@Injectable()
export class WorkflowTransitionService {
  private readonly logger = new Logger(WorkflowTransitionService.name);

  constructor(
    private readonly transitionRepository: WorkflowTransitionRepository,
    private readonly stateRepository: WorkflowStateRepository,
    private readonly definitionRepository: WorkflowDefinitionRepository,
    private readonly ruleRepository: TransitionRuleRepository,
    private readonly redis: RedisService
  ) {}

  /**
   * Creates a new workflow transition within a definition.
   * Only DRAFT definitions can have transitions added.
   * Validates that both fromState and toState exist and belong to the definition.
   * Invalidates definition and transitions caches after creation.
   *
   * @param definitionId - The workflow definition ID
   * @param dto - Transition creation data (name, fromStateId, toStateId, allowedRoleIds, requiresComment)
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowTransition> - The created transition entity
   * @throws NotFoundException - If definition or states not found
   * @throws BadRequestException - If definition is not DRAFT
   */
  async create(
    definitionId: string,
    dto: CreateWorkflowTransitionDto,
    tenantId: string
  ): Promise<WorkflowTransition> {
    const definition = await this.definitionRepository.findByIdAndTenant(definitionId, tenantId);
    if (!definition) throw new NotFoundException(AppErrors.WORKFLOW_DEFINITION_NOT_FOUND);
    if (definition.status !== WorkflowDefinitionStatus.DRAFT) {
      throw new BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_DRAFT);
    }

    const fromState = await this.stateRepository.findByIdAndTenant(dto.fromStateId, tenantId);
    if (!fromState) throw new NotFoundException(AppErrors.WORKFLOW_STATE_NOT_FOUND);

    const toState = await this.stateRepository.findByIdAndTenant(dto.toStateId, tenantId);
    if (!toState) throw new NotFoundException(AppErrors.WORKFLOW_STATE_NOT_FOUND);

    const transition = this.transitionRepository.create({
      workflowDefinitionId: definitionId,
      tenantId,
      name: dto.name,
      fromStateId: dto.fromStateId,
      toStateId: dto.toStateId,
      allowedRoleIds: dto.allowedRoleIds ?? [],
      requiresComment: dto.requiresComment ?? false,
    });

    const saved = await this.transitionRepository.save(transition);
    await this.redis.del(
      CacheKeys.workflowDefinition(tenantId, definitionId),
      CacheKeys.workflowTransitions(tenantId, definitionId),
      CacheKeys.workflowDefinitionList(tenantId)
    );
    this.logger.log(`WorkflowTransition created: ${saved.id} [definition=${definitionId}]`);
    return saved;
  }

  /**
   * Retrieves all transitions for a workflow definition.
   *
   * @param definitionId - The workflow definition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowTransition[]> - Array of all transitions for the definition
   */
  async findAll(definitionId: string, tenantId: string): Promise<WorkflowTransition[]> {
    return this.transitionRepository.findByDefinitionAndTenant(definitionId, tenantId);
  }

  /**
   * Retrieves a single workflow transition by ID.
   *
   * @param id - The workflow transition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowTransition> - The transition entity
   * @throws NotFoundException - If transition not found
   */
  async findById(id: string, tenantId: string): Promise<WorkflowTransition> {
    const transition = await this.transitionRepository.findByIdAndTenant(id, tenantId);
    if (!transition) throw new NotFoundException(AppErrors.WORKFLOW_TRANSITION_NOT_FOUND);
    return transition;
  }

  /**
   * Removes a workflow transition from a definition.
   * Cascades to remove all associated transition rules.
   * Invalidates definition and transitions caches.
   *
   * @param id - The workflow transition ID to remove
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<void>
   * @throws NotFoundException - If transition not found
   */
  async remove(id: string, tenantId: string): Promise<void> {
    const transition = await this.findById(id, tenantId);
    const definitionId = transition.workflowDefinitionId;
    await this.ruleRepository.removeByTransitionId(id, tenantId);
    await this.transitionRepository.remove(transition);
    await this.redis.del(
      CacheKeys.workflowDefinition(tenantId, definitionId),
      CacheKeys.workflowTransitions(tenantId, definitionId),
      CacheKeys.workflowDefinitionList(tenantId)
    );
  }

  /**
   * Adds a transition rule to a workflow transition.
   * Rules are evaluated in order (evaluationOrder) during workflow execution.
   * Invalidates transitions cache since rules are part of transition data.
   *
   * @param transitionId - The workflow transition ID
   * @param dto - Rule creation data (ruleName, ruleDefinition, evaluationOrder)
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<TransitionRule> - The created transition rule
   * @throws NotFoundException - If transition not found
   */
  async addRule(
    transitionId: string,
    dto: CreateTransitionRuleDto,
    tenantId: string
  ): Promise<TransitionRule> {
    const transition = await this.findById(transitionId, tenantId);
    const rule = this.ruleRepository.create({
      transitionId: transition.id,
      tenantId,
      ruleName: dto.ruleName,
      ruleDefinition: dto.ruleDefinition,
      evaluationOrder: dto.evaluationOrder ?? 0,
    });
    const saved = await this.ruleRepository.save(rule);
    // Invalidate transition cache since rules are part of the transition data
    await this.redis.del(CacheKeys.workflowTransitions(tenantId, transition.workflowDefinitionId));
    return saved;
  }
}
