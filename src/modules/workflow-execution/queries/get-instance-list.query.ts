import { IQuery } from '@nestjs/cqrs';
import { WorkflowInstance, WorkflowInstanceStatus } from '../entities/workflow-instance.entity';

export class GetInstanceListQuery implements IQuery {
  constructor(
    public readonly tenantId: string,
    public readonly page: number,
    public readonly limit: number,
    public readonly status?: WorkflowInstanceStatus,
    public readonly workflowDefinitionId?: string,
  ) {}
}

export interface GetInstanceListResult {
  data: WorkflowInstance[];
  total: number;
  page: number;
  limit: number;
}

