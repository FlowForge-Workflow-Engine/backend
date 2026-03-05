import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowState } from '../entities/workflow-state.entity';

@Injectable()
export class WorkflowStateRepository {
  constructor(
    @InjectRepository(WorkflowState)
    private readonly repo: Repository<WorkflowState>,
  ) {}

  create(data: Partial<WorkflowState>): WorkflowState {
    return this.repo.create(data);
  }

  async save(entity: WorkflowState): Promise<WorkflowState> {
    return this.repo.save(entity);
  }

  async findByIdAndTenant(
    id: string,
    tenantId: string,
  ): Promise<WorkflowState | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  async findByDefinitionAndTenant(
    workflowDefinitionId: string,
    tenantId: string,
  ): Promise<WorkflowState[]> {
    return this.repo.find({
      where: { workflowDefinitionId, tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  async findInitialState(
    workflowDefinitionId: string,
    tenantId: string,
  ): Promise<WorkflowState | null> {
    return this.repo.findOne({
      where: { workflowDefinitionId, tenantId, isInitial: true },
    });
  }

  async countInitialStates(
    workflowDefinitionId: string,
    tenantId: string,
  ): Promise<number> {
    return this.repo.count({
      where: { workflowDefinitionId, tenantId, isInitial: true },
    });
  }

  async remove(entity: WorkflowState): Promise<void> {
    await this.repo.remove(entity);
  }
}

