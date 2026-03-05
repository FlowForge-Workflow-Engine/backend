import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowInstance, WorkflowInstanceStatus } from '../entities/workflow-instance.entity';

@Injectable()
export class WorkflowInstanceRepository {
  constructor(
    @InjectRepository(WorkflowInstance)
    private readonly repo: Repository<WorkflowInstance>,
  ) {}

  create(data: Partial<WorkflowInstance>): WorkflowInstance {
    return this.repo.create(data);
  }

  async save(entity: WorkflowInstance): Promise<WorkflowInstance> {
    return this.repo.save(entity);
  }

  async findByIdAndTenant(id: string, tenantId: string): Promise<WorkflowInstance | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  async findAllByTenant(
    tenantId: string,
    options: {
      status?: WorkflowInstanceStatus;
      workflowDefinitionId?: string;
      page: number;
      limit: number;
    },
  ): Promise<[WorkflowInstance[], number]> {
    const where: Record<string, unknown> = { tenantId };
    if (options.status) where.status = options.status;
    if (options.workflowDefinitionId) where.workflowDefinitionId = options.workflowDefinitionId;

    return this.repo.findAndCount({
      where: where as any,
      order: { createdAt: 'DESC' },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    });
  }
}

