import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { TransitionRule } from "../entities/transition-rule.entity";
import { BaseRepository, RequestContextService } from "@app/database";

@Injectable()
export class TransitionRuleRepository extends BaseRepository<TransitionRule> {
  constructor(
    @InjectRepository(TransitionRule) readonly entityRepo: Repository<TransitionRule>,
    readonly requestContext: RequestContextService
  ) {
    super(entityRepo, requestContext);
  }

  create(data: Partial<TransitionRule>): TransitionRule {
    return this.repo.create(data);
  }

  async save(entity: TransitionRule): Promise<TransitionRule> {
    return this.repo.save(entity);
  }

  async findByTransitionId(transitionId: string, tenantId: string): Promise<TransitionRule[]> {
    return this.repo.find({
      where: { transitionId, tenantId },
      order: { evaluationOrder: "ASC" },
    });
  }

  async findByIdAndTenant(id: string, tenantId: string): Promise<TransitionRule | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  async removeByTransitionIds(transitionIds: string[], tenantId: string): Promise<void> {
    if (!transitionIds.length) return;
    await this.repo.delete({ transitionId: In(transitionIds), tenantId });
  }

  async removeByTransitionId(transitionId: string, tenantId: string): Promise<void> {
    await this.removeByTransitionIds([transitionId], tenantId);
  }

  async remove(entity: TransitionRule): Promise<void> {
    await this.repo.remove(entity);
  }
}
