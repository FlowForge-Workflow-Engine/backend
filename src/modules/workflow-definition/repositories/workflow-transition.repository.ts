import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { Repository } from "typeorm";
import { WorkflowTransition } from "../entities/workflow-transition.entity";

@Injectable()
export class WorkflowTransitionRepository {
  constructor(
    @InjectRepository(WorkflowTransition)
    private readonly repo: Repository<WorkflowTransition>
  ) {}

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

  async findByFromStateId(fromStateId: string, tenantId: string): Promise<WorkflowTransition[]> {
    return this.repo.find({ where: { fromStateId, tenantId } });
  }

  async remove(entity: WorkflowTransition): Promise<void> {
    await this.repo.remove(entity);
  }
}
