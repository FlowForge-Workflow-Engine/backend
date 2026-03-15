import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InstanceFormSchema } from "../entities/instance-form-schema.entity";

@Injectable()
export class InstanceFormSchemaRepository {
  constructor(
    @InjectRepository(InstanceFormSchema)
    private readonly repo: Repository<InstanceFormSchema>
  ) {}

  create(data: Partial<InstanceFormSchema>): InstanceFormSchema {
    return this.repo.create(data);
  }

  async save(entity: InstanceFormSchema): Promise<InstanceFormSchema> {
    return this.repo.save(entity);
  }

  async findByDefinitionAndTenant(
    workflowDefinitionId: string,
    tenantId: string
  ): Promise<InstanceFormSchema | null> {
    return this.repo.findOne({ where: { workflowDefinitionId, tenantId } });
  }

  async removeByDefinitionId(workflowDefinitionId: string, tenantId: string): Promise<void> {
    await this.repo.delete({ workflowDefinitionId, tenantId });
  }
}
