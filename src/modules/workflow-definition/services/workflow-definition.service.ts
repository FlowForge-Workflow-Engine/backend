import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { generateUUID } from "@app/shared/utils/uuid.util";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { WorkflowVersionService } from "./workflow-version.service";
import { WorkflowDefinitionPublisher } from "../publishers/workflow-definition.publisher";
import { WorkflowDefinition, WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowDefinitionVersion } from "../entities/workflow-definition-version.entity";
import { CreateWorkflowDefinitionDto } from "../dto/create-workflow-definition.dto";
import { FindWorkflowDefinitionDto } from "../dto/find-workflow-definition.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

/**
 * Internal service for managing workflow definitions.
 * Provides CRUD operations for workflow definitions, states, transitions, and rules.
 * NOT exported from WorkflowDefinitionModule; consuming modules use IWorkflowQueryContract.
 *
 * Responsibilities:
 * - Create, read, remove workflow definitions
 * - Publish definitions (delegates to WorkflowVersionService)
 * - Deprecate published definitions
 * - Manage workflow states, transitions, and transition rules
 * - Invalidate caches on mutations
 */
@Injectable()
export class WorkflowDefinitionService {
  private readonly logger = new Logger(WorkflowDefinitionService.name);

  constructor(
    private readonly definitionRepository: WorkflowDefinitionRepository,
    private readonly versionService: WorkflowVersionService,
    private readonly publisher: WorkflowDefinitionPublisher,
    private readonly redis: RedisService
  ) {}

  /**
   * Creates a new workflow definition in DRAFT status.
   * Initializes currentVersion to 1 for the first publish.
   * Invalidates definition list cache after creation.
   *
   * @param dto - Workflow definition creation data (name, description)
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param createdBy - The user ID who created the definition
   * @returns Promise<WorkflowDefinition> - The created definition entity
   */
  async create(
    dto: CreateWorkflowDefinitionDto,
    tenantId: string,
    createdBy: string
  ): Promise<WorkflowDefinition> {
    const definition = this.definitionRepository.create({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      status: WorkflowDefinitionStatus.DRAFT,
      currentVersion: 1,
      createdBy,
    });

    const saved = await this.definitionRepository.save(definition);
    // Invalidate definition list for this tenant
    await this.redis.del(CacheKeys.workflowDefinitionList(tenantId));
    this.logger.log(`WorkflowDefinition created: ${saved.id} [tenant=${tenantId}]`);
    return saved;
  }

  /**
   * Retrieves paginated workflow definitions for a tenant.
   *
   * @param dto - Pagination parameters
   * @param tenantId - The tenant ID
   * @returns Promise<WorkflowDefinition[]> - Paginated definitions for the tenant
   */
  async findAll(dto: FindWorkflowDefinitionDto, tenantId: string): Promise<WorkflowDefinition[]> {
    const { page, limit } = dto;
    return this.definitionRepository.findAllByTenant(tenantId, { page, limit });
  }

  /**
   * Retrieves a single workflow definition by ID.
   *
   * @param id - The workflow definition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowDefinition> - The definition entity
   * @throws NotFoundException - If definition not found
   */
  async findById(id: string, tenantId: string): Promise<WorkflowDefinition> {
    const definition = await this.definitionRepository.findByIdAndTenant(id, tenantId);
    if (!definition) throw new NotFoundException(AppErrors.WORKFLOW_DEFINITION_NOT_FOUND);
    return definition;
  }

  /**
   * Removes a workflow definition.
   * Only DRAFT definitions can be removed; published definitions must be deprecated first.
   * Invalidates definition and list caches after removal.
   *
   * @param id - The workflow definition ID to remove
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<void>
   * @throws NotFoundException - If definition not found
   * @throws BadRequestException - If definition is not in DRAFT status
   */
  async remove(id: string, tenantId: string): Promise<void> {
    const definition = await this.findById(id, tenantId);

    if (definition.status !== WorkflowDefinitionStatus.DRAFT) {
      throw new BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_DRAFT);
    }

    await this.definitionRepository.remove(definition);

    await this.redis.del(
      CacheKeys.workflowDefinition(tenantId, id),
      CacheKeys.workflowDefinitionList(tenantId)
    );
    this.logger.log(`WorkflowDefinition removed: ${id} [tenant=${tenantId}]`);
  }

  /**
   * Publishes a workflow definition.
   * Creates an immutable snapshot of states, transitions, and rules.
   * Delegates to WorkflowVersionService to handle versioning and event publishing.
   * Cannot publish DEPRECATED definitions.
   *
   * @param id - The workflow definition ID to publish
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param publishedBy - The user ID who published the definition
   * @returns Promise<WorkflowDefinitionVersion> - The created version record
   * @throws NotFoundException - If definition not found
   * @throws BadRequestException - If definition is DEPRECATED
   */
  async publish(id: string, tenantId: string, publishedBy: string): Promise<WorkflowDefinitionVersion> {
    const definition = await this.findById(id, tenantId);

    if (definition.status === WorkflowDefinitionStatus.DEPRECATED) {
      throw new BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_DRAFT);
    }

    return this.versionService.publish(definition, publishedBy);
  }

  /**
   * Deprecates a published workflow definition.
   * Marks it as DEPRECATED and publishes WORKFLOW_DEFINITION_DEPRECATED event.
   * Prevents new workflow instances from being created with this definition.
   * Invalidates definition and list caches after deprecation.
   *
   * @param id - The workflow definition ID to deprecate
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param deprecatedBy - The user ID who deprecated the definition
   * @returns Promise<WorkflowDefinition> - The deprecated definition entity
   * @throws NotFoundException - If definition not found
   * @throws BadRequestException - If definition is not PUBLISHED
   */
  async deprecate(id: string, tenantId: string, deprecatedBy: string): Promise<WorkflowDefinition> {
    const definition = await this.findById(id, tenantId);

    if (definition.status !== WorkflowDefinitionStatus.PUBLISHED) {
      throw new BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_PUBLISHED);
    }

    definition.status = WorkflowDefinitionStatus.DEPRECATED;
    const saved = await this.definitionRepository.save(definition);

    await this.redis.del(
      CacheKeys.workflowDefinition(tenantId, id),
      CacheKeys.workflowDefinitionList(tenantId)
    );

    this.publisher.publishWorkflowDefinitionDeprecated({
      eventId: generateUUID(),
      tenantId,
      definitionId: id,
      occurredAt: new Date().toISOString(),
    });

    this.logger.log(`WorkflowDefinition deprecated: ${id} by ${deprecatedBy}`);
    return saved;
  }
}
