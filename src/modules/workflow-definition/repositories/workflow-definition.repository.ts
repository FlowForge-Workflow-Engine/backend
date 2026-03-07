import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { FindOptionsWhere, Repository } from "typeorm";
import { WorkflowDefinition, WorkflowDefinitionStatus } from "../entities/workflow-definition.entity";

@Injectable()
export class WorkflowDefinitionRepository {
  constructor(
    @InjectRepository(WorkflowDefinition)
    private readonly repo: Repository<WorkflowDefinition>
  ) {}

  create(data: Partial<WorkflowDefinition>): WorkflowDefinition {
    return this.repo.create(data);
  }

  async save(entity: WorkflowDefinition): Promise<WorkflowDefinition> {
    return this.repo.save(entity);
  }

  async findByIdAndTenant(id: string, tenantId: string): Promise<WorkflowDefinition | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  async findAllByTenant(
    tenantId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<[WorkflowDefinition[], number]> {
    const { page, limit } = options;
    const { skip, take } = pagination(page, limit);

    return this.repo.findAndCount({
      where: { tenantId },
      order: { createdAt: "DESC" },
      skip,
      take,
    });
  }

  /**
   * Counts workflow definitions for a tenant, optionally constrained by lifecycle status.
   * This supports dashboard-style summary reads without exposing repository access cross-module.
   */
  async countByTenant(
    tenantId: string,
    options: { status?: WorkflowDefinitionStatus } = {}
  ): Promise<number> {
    const where: FindOptionsWhere<WorkflowDefinition> = { tenantId };
    if (options.status) {
      where.status = options.status;
    }

    return this.repo.count({ where });
  }

  async remove(entity: WorkflowDefinition): Promise<void> {
    await this.repo.remove(entity);
  }
}
