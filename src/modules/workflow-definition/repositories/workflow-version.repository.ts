import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WorkflowDefinitionVersion } from "../entities/workflow-definition-version.entity";
import { BaseRepository, RequestContextService } from "@app/database";

@Injectable()
export class WorkflowVersionRepository extends BaseRepository<WorkflowDefinitionVersion> {
  constructor(
    @InjectRepository(WorkflowDefinitionVersion) readonly entityRepo: Repository<WorkflowDefinitionVersion>,
    readonly requestContext: RequestContextService
  ) {
    super(entityRepo, requestContext);
  }

  create(data: Partial<WorkflowDefinitionVersion>): WorkflowDefinitionVersion {
    return this.repo.create(data);
  }

  async save(entity: WorkflowDefinitionVersion): Promise<WorkflowDefinitionVersion> {
    return this.repo.save(entity);
  }

  async findActiveVersion(
    workflowDefinitionId: string,
    tenantId: string
  ): Promise<WorkflowDefinitionVersion | null> {
    return this.repo.findOne({
      where: { workflowDefinitionId, tenantId, isActive: true },
    });
  }

  async findByDefinitionAndVersion(
    workflowDefinitionId: string,
    versionNumber: number,
    tenantId: string
  ): Promise<WorkflowDefinitionVersion | null> {
    return this.repo.findOne({
      where: { workflowDefinitionId, versionNumber, tenantId },
    });
  }

  async findAllByDefinition(
    workflowDefinitionId: string,
    tenantId: string
  ): Promise<WorkflowDefinitionVersion[]> {
    return this.repo.find({
      where: { workflowDefinitionId, tenantId },
      order: { versionNumber: "DESC" },
    });
  }

  /**
   * Deactivate all versions for a definition — called before activating a new one.
   */
  async deactivateAll(workflowDefinitionId: string, tenantId: string): Promise<void> {
    await this.repo.update({ workflowDefinitionId, tenantId }, { isActive: false });
  }
}
