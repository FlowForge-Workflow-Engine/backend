import { IQuery } from '@nestjs/cqrs';
import { WorkflowInstance } from '../entities/workflow-instance.entity';

export class GetInstanceDetailQuery implements IQuery {
  constructor(
    public readonly instanceId: string,
    public readonly tenantId: string,
  ) {}
}

export type GetInstanceDetailResult = WorkflowInstance;

