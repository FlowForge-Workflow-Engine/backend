import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { AuditLog } from "../entities/audit-log.entity";

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Idempotency check — must be called before every insert.
   * Returns the existing record if the eventId was already processed.
   */
  async findByEventId(eventId: string, tenantId: string): Promise<AuditLog | null> {
    return this.repo.findOne({ where: { eventId, tenantId } });
  }

  /**
   * Returns paginated audit logs for a workflow instance scoped to a tenant.
   * Results are ordered newest-first.
   */
  async findByInstanceId(
    instanceId: string,
    tenantId: string,
    page: number,
    limit: number
  ): Promise<[AuditLog[], number]> {
    const { skip, take } = pagination(page, limit);

    return this.repo.findAndCount({
      where: { instanceId, tenantId },
      order: { createdAt: "DESC" },
      skip,
      take,
    });
  }

  async insert(data: Partial<AuditLog>): Promise<AuditLog> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  /**
   * Purpose: atomically perform the audit idempotency check and insert for NATS-driven writes.
   * This keeps both queries inside one tenant-scoped transaction so RLS sees the same tenant context.
   */
  async insertIfAbsent(eventId: string, tenantId: string, data: Partial<AuditLog>): Promise<boolean> {
    return this.withTenantTransaction(tenantId, async (manager) => {
      const repo = manager.getRepository(AuditLog);
      const existing = await repo.findOne({ where: { eventId, tenantId } });

      if (existing) return false;

      await repo.save(repo.create(data));
      return true;
    });
  }

  /**
   * Purpose: execute subscriber-side audit persistence on one transaction and one DB connection.
   * This is the minimal fix needed so PostgreSQL RLS can see the tenant context for NATS handlers.
   */
  private async withTenantTransaction<T>(
    tenantId: string,
    fn: (manager: EntityManager) => Promise<T>
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      // Set transaction-local tenant context on the same connection used by all queries below.
      await manager.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);
      return fn(manager);
    });
  }
}
