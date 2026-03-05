import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationTemplate } from '../entities/notification-template.entity';

@Injectable()
export class NotificationTemplateRepository {
  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly repo: Repository<NotificationTemplate>,
  ) {}

  findById(id: string, tenantId: string): Promise<NotificationTemplate | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  findAllByTenant(tenantId: string): Promise<NotificationTemplate[]> {
    return this.repo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Returns all active templates for a given NATS event trigger, scoped to a tenant.
   */
  findActiveByEventTrigger(
    eventTrigger: string,
    tenantId: string,
  ): Promise<NotificationTemplate[]> {
    return this.repo.find({ where: { eventTrigger, tenantId, isActive: true } });
  }

  insert(data: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<NotificationTemplate>,
  ): Promise<NotificationTemplate | null> {
    await this.repo.update({ id, tenantId }, data);
    return this.findById(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.repo.delete({ id, tenantId });
  }
}

