import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { NotificationLog, NotificationStatus } from "../entities/notification-log.entity";
import { BaseRepository, RequestContextService } from "@app/database";
import { DBRoles } from "@app/database/constants/db-roles.enum";

@Injectable()
export class NotificationLogRepository extends BaseRepository<NotificationLog> {
  constructor(
    @InjectRepository(NotificationLog) readonly entityRepo: Repository<NotificationLog>,
    readonly requestContext: RequestContextService,
    private readonly dataSource: DataSource
  ) {
    super(entityRepo, requestContext);
  }

  async incrementRetry(id: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(NotificationLog)
      .set({ retryCount: () => "retry_count + 1" })
      .where("id = :id", { id })
      .execute();
  }

  /**
   * Purpose: create the initial notification log row for subscriber-triggered deliveries under tenant DB context.
   */
  async insert(data: Partial<NotificationLog>): Promise<NotificationLog> {
    const tenantId = data.tenantId;
    if (!tenantId) throw new Error("NotificationLogRepository.insert requires tenantId.");

    return this.withTenantWriteScope(tenantId, async (repo) => {
      const entity = repo.create(data);
      return repo.save(entity);
    });
  }

  /**
   * Purpose: update notification delivery status using the same tenant-scoped connection pattern as the insert.
   */
  async updateStatus(
    id: string,
    tenantId: string,
    status: NotificationStatus,
    sentAt?: Date,
    errorMessage?: string
  ): Promise<void> {
    await this.withTenantWriteScope(tenantId, async (repo) => {
      await repo.update(
        { id, tenantId },
        {
          status,
          sentAt: sentAt ?? null,
          errorMessage: errorMessage ?? null,
        }
      );
    });
  }

  /**
   * Purpose: keep subscriber-side notification log writes on one transaction and one connection for RLS.
   */
  private async withTenantWriteScope<T>(
    tenantId: string,
    fn: (repo: Repository<NotificationLog>) => Promise<T>
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      // Set transaction-local tenant context before writing to the RLS-protected notification log table.
      await manager.query(`SET LOCAL ROLE ${DBRoles.TENANT_USER}`); // ← ADD
      await manager.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);
      return fn(manager.getRepository(NotificationLog));
    });
  }
}
