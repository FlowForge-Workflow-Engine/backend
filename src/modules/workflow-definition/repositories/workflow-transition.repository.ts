import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { Repository } from "typeorm";
import { WorkflowTransition } from "../entities/workflow-transition.entity";
import { BaseRepository, RequestContextService } from "@app/database";

@Injectable()
export class WorkflowTransitionRepository extends BaseRepository<WorkflowTransition> {
  constructor(
    @InjectRepository(WorkflowTransition) readonly entityRepo: Repository<WorkflowTransition>,
    readonly requestContext: RequestContextService
  ) {
    super(entityRepo, requestContext);
  }

  create(data: Partial<WorkflowTransition>): WorkflowTransition {
    return this.repo.create(data);
  }

  async save(entity: WorkflowTransition): Promise<WorkflowTransition> {
    return this.repo.save(entity);
  }

  async findByIdAndTenant(id: string, tenantId: string): Promise<WorkflowTransition | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  async findByDefinitionAndTenant(
    workflowDefinitionId: string,
    tenantId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<WorkflowTransition[]> {
    const { page, limit } = options;
    const { skip, take } = pagination(page, limit);

    return this.repo.find({
      where: { workflowDefinitionId, tenantId },
      order: { createdAt: "ASC" },
      skip,
      take,
    });
  }

  async findIdsByDefinitionAndTenant(workflowDefinitionId: string, tenantId: string): Promise<string[]> {
    const transitions = await this.repo.find({
      select: { id: true },
      where: { workflowDefinitionId, tenantId },
    });

    return transitions.map((transition) => transition.id);
  }

  async findByFromStateId(fromStateId: string, tenantId: string): Promise<WorkflowTransition[]> {
    return this.repo.find({ where: { fromStateId, tenantId } });
  }

  async removeByDefinitionId(workflowDefinitionId: string, tenantId: string): Promise<void> {
    await this.repo.delete({ workflowDefinitionId, tenantId });
  }

  async remove(entity: WorkflowTransition): Promise<void> {
    await this.repo.remove(entity);
  }
}
