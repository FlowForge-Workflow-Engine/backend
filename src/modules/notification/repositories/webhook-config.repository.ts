import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookConfig } from '../entities/webhook-config.entity';

@Injectable()
export class WebhookConfigRepository {
  constructor(
    @InjectRepository(WebhookConfig)
    private readonly repo: Repository<WebhookConfig>,
  ) {}

  findById(id: string, tenantId: string): Promise<WebhookConfig | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  findAllByTenant(tenantId: string): Promise<WebhookConfig[]> {
    return this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Returns all active webhook configs where `event_triggers` array contains
   * the given eventName, scoped to a tenant.
   * Uses PostgreSQL `= ANY(event_triggers)` syntax via raw query for array containment.
   */
  findActiveByEventName(eventName: string, tenantId: string): Promise<WebhookConfig[]> {
    return this.repo
      .createQueryBuilder('wc')
      .where('wc.tenantId = :tenantId', { tenantId })
      .andWhere('wc.isActive = true')
      .andWhere(':eventName = ANY(wc.eventTriggers)', { eventName })
      .getMany();
  }

  insert(data: Partial<WebhookConfig>): Promise<WebhookConfig> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<WebhookConfig>,
  ): Promise<WebhookConfig | null> {
    await this.repo.update({ id, tenantId }, data);
    return this.findById(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.repo.delete({ id, tenantId });
  }
}

