import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import {
  WorkflowInstanceFormField,
  WorkflowInstanceFormSchema,
} from "@app/shared/interfaces/contracts/workflow-query.contract";
import { generateUUID } from "@app/shared/utils/uuid.util";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { InstanceFormSchemaRepository } from "../repositories/instance-form-schema.repository";
import { WorkflowStateRepository } from "../repositories/workflow-state.repository";
import { WorkflowTransitionRepository } from "../repositories/workflow-transition.repository";
import { TransitionRuleRepository } from "../repositories/transition-rule.repository";
import { WorkflowVersionService } from "./workflow-version.service";
import { WorkflowDefinitionPublisher } from "../publishers/workflow-definition.publisher";
import { WorkflowDefinition, WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowDefinitionVersion } from "../entities/workflow-definition-version.entity";
import { CreateWorkflowDefinitionDto } from "../dto/create-workflow-definition.dto";
import { FindWorkflowDefinitionDto } from "../dto/find-workflow-definition.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";

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
    private readonly instanceFormSchemaRepository: InstanceFormSchemaRepository,
    private readonly stateRepository: WorkflowStateRepository,
    private readonly transitionRepository: WorkflowTransitionRepository,
    private readonly ruleRepository: TransitionRuleRepository,
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
   * @returns Promise<{ data: WorkflowDefinition[]; total: number }> - Current page data plus total count
   */
  async findAll(
    dto: FindWorkflowDefinitionDto,
    tenantId: string
  ): Promise<{ data: WorkflowDefinition[]; total: number }> {
    const { page, limit } = dto;
    const [data, total] = await this.definitionRepository.findAllByTenant(tenantId, { page, limit });

    // Keep the total definition count with the current slice so controllers can expose true pagination metadata.
    return { data, total };
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
   * Retrieves the normalized instance form schema for a workflow definition.
   * Uses cache-aside to avoid repeated schema reconstruction from the database record.
   *
   * @param definitionId - The workflow definition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowInstanceFormSchema> - Normalized instance form schema
   */
  async getInstanceFormSchema(definitionId: string, tenantId: string): Promise<WorkflowInstanceFormSchema> {
    // Ensure the requested definition exists before reading its form schema.
    await this.findById(definitionId, tenantId);

    const key = CacheKeys.workflowInstanceFormSchema(tenantId, definitionId);
    const cached = await this.redis.get<WorkflowInstanceFormSchema>(key);
    if (cached) return cached;

    // Normalize persisted JSON into the contract shape expected by consumers.
    const record = await this.instanceFormSchemaRepository.findByDefinitionAndTenant(definitionId, tenantId);
    const schema = this.normalizeInstanceFormSchema(record?.schema);

    await this.redis.set(key, schema, CacheTTL.LONG);
    return schema;
  }

  /**
   * Retrieves a definition together with all of its published version records.
   *
   * @param id - The workflow definition ID
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<{ definition: WorkflowDefinition; versions: WorkflowDefinitionVersion[] }>
   */
  async findVersions(
    id: string,
    tenantId: string
  ): Promise<{ definition: WorkflowDefinition; versions: WorkflowDefinitionVersion[] }> {
    // Load the definition first so callers receive a not-found error for invalid IDs.
    const definition = await this.findById(id, tenantId);
    const versions = await this.versionService.findAllByDefinition(id, tenantId);

    return { definition, versions };
  }

  /**
   * Retrieves a single immutable version record for a workflow definition.
   *
   * @param id - The workflow definition ID
   * @param versionNumber - Published version number to fetch
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<WorkflowDefinitionVersion> - Matching version record
   */
  async findVersionByNumber(
    id: string,
    versionNumber: number,
    tenantId: string
  ): Promise<WorkflowDefinitionVersion> {
    // Reuse definition existence validation before querying a specific version number.
    await this.findById(id, tenantId);
    return this.versionService.findByDefinitionAndVersion(id, versionNumber, tenantId);
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

    // Load only transition IDs for the definition so we can delete their rules first.
    const transitionIds = await this.transitionRepository.findIdsByDefinitionAndTenant(id, tenantId);

    // Remove all rules and form schema associated with the definition's transitions first.
    await Promise.all([
      this.ruleRepository.removeByTransitionIds(transitionIds, tenantId),
      this.instanceFormSchemaRepository.removeByDefinitionId(id, tenantId),
    ]);

    await this.transitionRepository.removeByDefinitionId(id, tenantId);
    await this.stateRepository.removeByDefinitionId(id, tenantId);

    // Remove the definition last so we can validate it exists before deleting its children.
    await this.definitionRepository.remove(definition);

    await this.redis.del(
      CacheKeys.workflowDefinition(tenantId, id),
      CacheKeys.workflowDefinitionList(tenantId),
      CacheKeys.workflowStates(tenantId, id),
      CacheKeys.workflowTransitions(tenantId, id),
      CacheKeys.workflowInstanceFormSchema(tenantId, id)
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
   * @param actor - The user ID who published the definition
   * @returns Promise<WorkflowDefinitionVersion> - The created version record
   * @throws NotFoundException - If definition not found
   * @throws BadRequestException - If definition is DEPRECATED
   */
  async publish(id: string, tenantId: string, actor: IJwtPayload): Promise<WorkflowDefinitionVersion> {
    const definition = await this.findById(id, tenantId);

    if (definition.status === WorkflowDefinitionStatus.DEPRECATED) {
      throw new BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_DRAFT);
    }

    return this.versionService.publish(definition, actor);
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

  /**
   * Normalizes persisted schema JSON into a well-typed instance form schema object.
   * Filters out malformed fields before returning the result.
   *
   * @param schema - Raw schema payload stored in the database
   * @returns WorkflowInstanceFormSchema - Sanitized schema object
   */
  private normalizeInstanceFormSchema(
    schema: Record<string, unknown> | null | undefined
  ): WorkflowInstanceFormSchema {
    // Extract the raw fields array defensively because the stored schema is untyped JSON.
    const rawFields = Array.isArray((schema as { fields?: unknown } | null | undefined)?.fields)
      ? ((schema as { fields: unknown[] }).fields ?? [])
      : [];

    return {
      fields: rawFields
        .filter((field): field is WorkflowInstanceFormField => this.isWorkflowInstanceFormField(field))
        .map((field) => ({
          key: field.key,
          type: field.type,
          label: field.label,
          required: field.required,
        })),
    };
  }

  /**
   * Type guard for validating a raw schema field candidate.
   *
   * @param field - Unknown value from persisted schema JSON
   * @returns boolean - True when the value matches WorkflowInstanceFormField shape
   */
  private isWorkflowInstanceFormField(field: unknown): field is WorkflowInstanceFormField {
    if (!field || typeof field !== "object") return false;
    const candidate = field as Partial<WorkflowInstanceFormField>;

    return (
      typeof candidate.key === "string" &&
      typeof candidate.type === "string" &&
      typeof candidate.label === "string" &&
      typeof candidate.required === "boolean"
    );
  }
}
