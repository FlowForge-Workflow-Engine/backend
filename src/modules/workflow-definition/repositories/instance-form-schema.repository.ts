import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InstanceFormSchema } from "../entities/instance-form-schema.entity";
import { BaseRepository, RequestContextService } from "@app/database";

@Injectable()
export class InstanceFormSchemaRepository extends BaseRepository<InstanceFormSchema> {
  constructor(
    @InjectRepository(InstanceFormSchema)
    readonly entityRepo: Repository<InstanceFormSchema>,
    readonly requestContext: RequestContextService
  ) {
    super(entityRepo, requestContext);
  }

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
