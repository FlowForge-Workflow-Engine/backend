import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { GetInstanceListQuery, GetInstanceListResult } from "../queries/get-instance-list.query";

@QueryHandler(GetInstanceListQuery)
export class GetInstanceListHandler implements IQueryHandler<GetInstanceListQuery, GetInstanceListResult> {
  constructor(private readonly instanceRepo: WorkflowInstanceRepository) {}

  async execute(query: GetInstanceListQuery): Promise<GetInstanceListResult> {
    // Query a paginated list of instances with optional status and workflow filters.
    const [data, total] = await this.instanceRepo.findAllByTenant(query.tenantId, {
      status: query.status,
      workflowDefinitionId: query.workflowDefinitionId,
      page: query.page,
      limit: query.limit,
    });

    // Return page metadata alongside the current slice for UI pagination.
    return { data, total, page: query.page, limit: query.limit };
  }
}
