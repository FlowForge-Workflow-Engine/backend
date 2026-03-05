import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { generateUUID } from "@app/shared/utils/uuid.util";
import { NatsEvents } from "@app/shared/constants/nats-events.enum";
import { WorkflowDefinitionRepository } from "../repositories/workflow-definition.repository";
import { WorkflowVersionRepository } from "../repositories/workflow-version.repository";
import { WorkflowVersionService } from "./workflow-version.service";
import { WorkflowDefinitionPublisher } from "../publishers/workflow-definition.publisher";
import { WorkflowDefinition, WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";
import { WorkflowDefinitionVersion } from "../entities/workflow-definition-version.entity";
import { CreateWorkflowDefinitionDto } from "../dto/create-workflow-definition.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

@Injectable()
export class WorkflowDefinitionService {
  private readonly logger = new Logger(WorkflowDefinitionService.name);

  constructor(
    private readonly definitionRepository: WorkflowDefinitionRepository,
    private readonly versionRepository: WorkflowVersionRepository,
    private readonly versionService: WorkflowVersionService,
    private readonly publisher: WorkflowDefinitionPublisher,
    private readonly redis: RedisService
  ) {}

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

  async findAll(tenantId: string): Promise<WorkflowDefinition[]> {
    return this.definitionRepository.findAllByTenant(tenantId);
  }

  async findById(id: string, tenantId: string): Promise<WorkflowDefinition> {
    const definition = await this.definitionRepository.findByIdAndTenant(id, tenantId);
    if (!definition) throw new NotFoundException(AppErrors.WORKFLOW_DEFINITION_NOT_FOUND);
    return definition;
  }

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
   * Publish a draft definition:
   * - Validates status is DRAFT (or PUBLISHED → re-publish bumps version)
   * - Delegates to WorkflowVersionService to build snapshot + persist version
   */
  async publish(id: string, tenantId: string, publishedBy: string): Promise<WorkflowDefinitionVersion> {
    const definition = await this.findById(id, tenantId);

    if (definition.status === WorkflowDefinitionStatus.DEPRECATED) {
      throw new BadRequestException(AppErrors.WORKFLOW_DEFINITION_NOT_DRAFT);
    }

    return this.versionService.publish(definition, publishedBy);
  }

  /**
   * Deprecate a published definition.
   * Marks it as deprecated and publishes WORKFLOW_DEFINITION_DEPRECATED.
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
