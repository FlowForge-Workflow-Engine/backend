import { IQuery } from "@nestjs/cqrs";
import { WorkflowInstance } from "../entities/workflow-instance.entity";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

export class GetInstanceListQuery implements IQuery {
  constructor(
    public readonly tenantId: string,
    public readonly page?: number,
    public readonly limit?: number,
    public readonly status?: WorkflowInstanceStatus,
    public readonly workflowDefinitionId?: string
  ) {}
}

export interface GetInstanceListResult {
  data: WorkflowInstance[];
  total: number;
  page?: number;
  limit?: number;
}
