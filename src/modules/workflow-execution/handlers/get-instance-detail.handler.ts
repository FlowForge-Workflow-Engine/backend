import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { WorkflowInstanceRepository } from "../repositories/workflow-instance.repository";
import { GetInstanceDetailQuery, GetInstanceDetailResult } from "../queries/get-instance-detail.query";

@QueryHandler(GetInstanceDetailQuery)
export class GetInstanceDetailHandler implements IQueryHandler<
  GetInstanceDetailQuery,
  GetInstanceDetailResult
> {
  constructor(private readonly instanceRepo: WorkflowInstanceRepository) {}

  async execute(query: GetInstanceDetailQuery): Promise<GetInstanceDetailResult> {
    // Load the instance by id with tenant isolation enforced at the repository layer.
    const instance = await this.instanceRepo.findByIdAndTenant(query.instanceId, query.tenantId);

    // Fail fast when the requested instance does not exist for this tenant.
    if (!instance) {
      throw new NotFoundException(AppErrors.WORKFLOW_INSTANCE_NOT_FOUND);
    }

    // Return the full instance detail used by the query side/UI.
    return instance;
  }
}
