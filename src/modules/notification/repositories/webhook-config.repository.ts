import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { DataSource, Repository } from "typeorm";
import { WebhookConfig } from "../entities/webhook-config.entity";

@Injectable()
export class WebhookConfigRepository {
  constructor(
    @InjectRepository(WebhookConfig)
    private readonly repo: Repository<WebhookConfig>,
    private readonly dataSource: DataSource
  ) {}

  findById(id: string, tenantId: string): Promise<WebhookConfig | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  findAllByTenant(
    tenantId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<WebhookConfig[]> {
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
   * Purpose: load active webhook configs for NATS dispatch inside a tenant-scoped DB transaction.
   * Returns all active webhook configs where `event_triggers` array contains
   * the given eventName, scoped to a tenant.
   * Uses PostgreSQL `= ANY(event_triggers)` syntax via raw query for array containment.
   */
  async findActiveByEventName(eventName: string, tenantId: string): Promise<WebhookConfig[]> {
    return this.withTenantReadScope(tenantId, async (repo) => {
      return repo
        .createQueryBuilder("wc")
        .where("wc.tenantId = :tenantId", { tenantId })
        .andWhere("wc.isActive = true")
        .andWhere(":eventName = ANY(wc.eventTriggers)", { eventName })
        .getMany();
    });
  }

  insert(data: Partial<WebhookConfig>): Promise<WebhookConfig> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, tenantId: string, data: Partial<WebhookConfig>): Promise<WebhookConfig | null> {
    await this.repo.update({ id, tenantId }, data);
    return this.findById(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.repo.delete({ id, tenantId });
  }

  /**
   * Purpose: keep subscriber-side webhook config reads on one transaction and one connection for RLS.
   */
  private async withTenantReadScope<T>(
    tenantId: string,
    fn: (repo: Repository<WebhookConfig>) => Promise<T>
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      // Set transaction-local tenant context before reading the RLS-protected webhook config table.
      await manager.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);
      return fn(manager.getRepository(WebhookConfig));
    });
  }
}
