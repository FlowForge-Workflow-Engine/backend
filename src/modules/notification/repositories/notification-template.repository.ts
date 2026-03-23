import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { DataSource, Repository } from "typeorm";
import { NotificationChannel, NotificationTemplate } from "../entities/notification-template.entity";
import { NotificationEventTrigger } from "../constants/notification-event-trigger.enum";
import { BaseRepository, RequestContextService } from "@app/database";
import { DBRoles } from "@app/database/constants/db-roles.enum";

@Injectable()
export class NotificationTemplateRepository extends BaseRepository<NotificationTemplate> {
  constructor(
    @InjectRepository(NotificationTemplate) readonly entityRepo: Repository<NotificationTemplate>,
    readonly requestContext: RequestContextService,
    private readonly dataSource: DataSource
  ) {
    super(entityRepo, requestContext);
  }

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
   * Purpose: load active templates for NATS-triggered notifications inside a tenant-scoped DB transaction.
   * Returns all active templates for a given NATS event trigger, scoped to a tenant.
   */
  async findActiveByEventTrigger(
    eventTrigger: NotificationEventTrigger,
    tenantId: string
  ): Promise<NotificationTemplate[]> {
    return this.withTenantReadScope(tenantId, async (repo) => {
      return repo.find({ where: { eventTrigger, tenantId, isActive: true } });
    });
  }

  /**
   * Purpose: let onboarding detect an existing tenant-created email template without relying on request-scoped tenant context.
   */
  async findFirstByEventTriggerAndChannel(
    eventTrigger: NotificationEventTrigger,
    channel: NotificationChannel,
    tenantId: string
  ): Promise<NotificationTemplate | null> {
    return this.withTenantReadScope(tenantId, async (repo) => {
      return repo.findOne({ where: { eventTrigger, channel, tenantId } });
    });
  }

  /**
   * Purpose: keep notification template writes tenant-safe even when they originate outside an authenticated tenant request.
   */
  async insert(data: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
    const tenantId = data.tenantId;
    if (!tenantId) throw new Error("NotificationTemplateRepository.insert requires tenantId.");

    return this.withTenantWriteScope(tenantId, async (repo) => {
      const entity = repo.create(data);
      return repo.save(entity);
    });
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
      await manager.query(`SET LOCAL ROLE ${DBRoles.TENANT_USER}`); // ← ADD
      await manager.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);
      return fn(manager.getRepository(NotificationTemplate));
    });
  }

  /**
   * Purpose: keep onboarding/bootstrap notification template writes on one tenant-scoped connection for RLS safety.
   */
  private async withTenantWriteScope<T>(
    tenantId: string,
    fn: (repo: Repository<NotificationTemplate>) => Promise<T>
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      // Set transaction-local tenant context before writing to the notification template table.
      await manager.query(`SET LOCAL ROLE ${DBRoles.TENANT_USER}`); // ← ADD
      await manager.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);
      return fn(manager.getRepository(NotificationTemplate));
    });
  }
}
