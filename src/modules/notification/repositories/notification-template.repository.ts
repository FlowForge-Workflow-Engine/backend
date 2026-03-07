import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { DataSource, Repository } from "typeorm";
import { NotificationTemplate } from "../entities/notification-template.entity";

@Injectable()
export class NotificationTemplateRepository {
  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly repo: Repository<NotificationTemplate>,
    private readonly dataSource: DataSource
  ) {}

  findById(id: string, tenantId: string): Promise<NotificationTemplate | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  findAllByTenant(
    tenantId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<NotificationTemplate[]> {
    const { page, limit } = options;
    const { skip, take } = pagination(page, limit);

    return this.repo.find({
      where: { tenantId },
      order: { createdAt: "DESC" },
      skip,
      take,
    });
  }

  /**
   * Purpose: load active templates for NATS-triggered notifications inside a tenant-scoped DB transaction.
   * Returns all active templates for a given NATS event trigger, scoped to a tenant.
   */
  async findActiveByEventTrigger(eventTrigger: string, tenantId: string): Promise<NotificationTemplate[]> {
    return this.withTenantReadScope(tenantId, async (repo) => {
      return repo.find({ where: { eventTrigger, tenantId, isActive: true } });
    });
  }

  insert(data: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<NotificationTemplate>
  ): Promise<NotificationTemplate | null> {
    await this.repo.update({ id, tenantId }, data);
    return this.findById(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.repo.delete({ id, tenantId });
  }

  /**
   * Purpose: keep subscriber-side template reads on one transaction and one connection so RLS can evaluate correctly.
   */
  private async withTenantReadScope<T>(
    tenantId: string,
    fn: (repo: Repository<NotificationTemplate>) => Promise<T>
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      // Set transaction-local tenant context on the same connection used by the template read.
      await manager.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);
      return fn(manager.getRepository(NotificationTemplate));
    });
  }
}
