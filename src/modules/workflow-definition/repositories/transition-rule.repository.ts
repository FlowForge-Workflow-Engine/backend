import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TransitionRule } from "../entities/transition-rule.entity";

@Injectable()
export class TransitionRuleRepository {
  constructor(
    @InjectRepository(TransitionRule)
    private readonly repo: Repository<TransitionRule>
  ) {}

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

  async removeByTransitionId(transitionId: string, tenantId: string): Promise<void> {
    const rules = await this.findByTransitionId(transitionId, tenantId);
    if (rules.length) await this.repo.remove(rules);
  }

  async remove(entity: TransitionRule): Promise<void> {
    await this.repo.remove(entity);
  }
}
