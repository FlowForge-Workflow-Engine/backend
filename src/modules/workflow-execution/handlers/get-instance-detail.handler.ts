import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { AppErrors } from '@app/shared/constants/app-errors.enum';
import { WorkflowInstanceRepository } from '../repositories/workflow-instance.repository';
import {
  GetInstanceDetailQuery,
  GetInstanceDetailResult,
} from '../queries/get-instance-detail.query';

@QueryHandler(GetInstanceDetailQuery)
export class GetInstanceDetailHandler
  implements IQueryHandler<GetInstanceDetailQuery, GetInstanceDetailResult>
{
  constructor(private readonly instanceRepo: WorkflowInstanceRepository) {}

  async execute(query: GetInstanceDetailQuery): Promise<GetInstanceDetailResult> {
    const instance = await this.instanceRepo.findByIdAndTenant(query.instanceId, query.tenantId);
    if (!instance) {
      throw new NotFoundException(AppErrors.WORKFLOW_INSTANCE_NOT_FOUND);
    }
    return instance;
  }
}

