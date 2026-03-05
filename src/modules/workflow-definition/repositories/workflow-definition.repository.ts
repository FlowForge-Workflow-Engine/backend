import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowDefinition } from '../entities/workflow-definition.entity';

@Injectable()
export class WorkflowDefinitionRepository {
  constructor(
    @InjectRepository(WorkflowDefinition)
    private readonly repo: Repository<WorkflowDefinition>,
  ) {}

  create(data: Partial<WorkflowDefinition>): WorkflowDefinition {
    return this.repo.create(data);
  }

  async save(entity: WorkflowDefinition): Promise<WorkflowDefinition> {
    return this.repo.save(entity);
  }

  async findByIdAndTenant(
    id: string,
    tenantId: string,
  ): Promise<WorkflowDefinition | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  async findAllByTenant(tenantId: string): Promise<WorkflowDefinition[]> {
    return this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async remove(entity: WorkflowDefinition): Promise<void> {
    await this.repo.remove(entity);
  }
}

