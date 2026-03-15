import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { Repository } from "typeorm";
import { WorkflowState } from "../entities/workflow-state.entity";

@Injectable()
export class WorkflowStateRepository {
  constructor(
    @InjectRepository(WorkflowState)
    private readonly repo: Repository<WorkflowState>
  ) {}

  create(data: Partial<WorkflowState>): WorkflowState {
    return this.repo.create(data);
  }

  async save(entity: WorkflowState): Promise<WorkflowState> {
    return this.repo.save(entity);
  }

  async findByIdAndTenant(id: string, tenantId: string): Promise<WorkflowState | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  async findByDefinitionAndTenant(
    workflowDefinitionId: string,
    tenantId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<WorkflowState[]> {
    const { page, limit } = options;
    const { skip, take } = pagination(page, limit);

    return this.repo.find({
      where: { workflowDefinitionId, tenantId },
      order: { createdAt: "ASC" },
      skip,
      take,
    });
  }

  async findInitialState(workflowDefinitionId: string, tenantId: string): Promise<WorkflowState | null> {
    return this.repo.findOne({
      where: { workflowDefinitionId, tenantId, isInitial: true },
    });
  }

  async countInitialStates(workflowDefinitionId: string, tenantId: string): Promise<number> {
    return this.repo.count({
      where: { workflowDefinitionId, tenantId, isInitial: true },
    });
  }

  async removeByDefinitionId(workflowDefinitionId: string, tenantId: string): Promise<void> {
    await this.repo.delete({ workflowDefinitionId, tenantId });
  }

  async remove(entity: WorkflowState): Promise<void> {
    await this.repo.remove(entity);
  }
}
