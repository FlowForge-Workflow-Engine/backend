import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { Repository } from "typeorm";
import { WorkflowInstance } from "../entities/workflow-instance.entity";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

@Injectable()
export class WorkflowInstanceRepository {
  constructor(
    @InjectRepository(WorkflowInstance)
    private readonly repo: Repository<WorkflowInstance>
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
      page?: number;
      limit?: number;
    }
  ): Promise<[WorkflowInstance[], number]> {
    const { page, limit } = options;
    const { skip, take } = pagination(page, limit);

    const where: Record<string, unknown> = { tenantId };
    if (options.status) where.status = options.status;
    if (options.workflowDefinitionId) where.workflowDefinitionId = options.workflowDefinitionId;

    return this.repo.findAndCount({
      where: where as any,
      order: { createdAt: "DESC" },
      skip,
      take,
    });
  }

  /**
   * Counts workflow instances for a tenant, with optional status filtering for summary views.
   */
  async countByTenant(
    tenantId: string,
    options: {
      status?: WorkflowInstanceStatus;
    } = {}
  ): Promise<number> {
    const where: Record<string, unknown> = { tenantId };
    if (options.status) where.status = options.status;

    return this.repo.count({ where: where as Partial<WorkflowInstance> });
  }
}
