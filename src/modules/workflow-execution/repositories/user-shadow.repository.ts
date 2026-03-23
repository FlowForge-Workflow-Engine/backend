import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { WeUserShadow } from "../entities/we-user-shadow.entity";
import { BaseRepository, RequestContextService } from "@app/database";
import { DBRoles } from "@app/database/constants/db-roles.enum";
import { DBVariables } from "@app/database/constants/db-variables.enum";

@Injectable()
export class UserShadowRepository extends BaseRepository<WeUserShadow> {
  constructor(
    @InjectRepository(WeUserShadow) readonly entityRepo: Repository<WeUserShadow>,
    readonly requestContext: RequestContextService,
    private readonly dataSource: DataSource
  ) {
    super(entityRepo, requestContext);
  }

  async findById(id: string): Promise<WeUserShadow | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Purpose: sync auth user snapshots from NATS into the tenant-scoped shadow table.
   * Idempotent upsert — safe to call multiple times with the same event.
   * On conflict (same id), update all mutable fields.
   */
  async upsert(data: Omit<WeUserShadow, never>): Promise<void> {
    await this.withTenantWriteScope(data.tenantId, async (repo) => {
      await repo
        .createQueryBuilder()
        .insert()
        .into(WeUserShadow)
        .values(data)
        .orUpdate(["email", "full_name", "roles", "is_active", "synced_at"], ["id"])
        .execute();
    });
  }

  /**
   * Purpose: update cached roles for auth events using the same tenant-scoped connection as the write.
   */
  async updateRoles(id: string, tenantId: string, roles: string[], syncedAt: Date): Promise<void> {
    await this.withTenantWriteScope(tenantId, async (repo) => {
      await repo.update({ id, tenantId }, { roles, syncedAt });
    });
  }

  /**
   * Purpose: mark shadow users inactive for auth deactivation events under the correct tenant DB context.
   */
  async deactivate(id: string, tenantId: string, syncedAt: Date): Promise<void> {
    await this.withTenantWriteScope(tenantId, async (repo) => {
      await repo.update({ id, tenantId }, { isActive: false, syncedAt });
    });
  }

  /**
   * Purpose: keep subscriber-triggered shadow writes on one transaction and one connection for RLS.
   */
  private async withTenantWriteScope<T>(
    tenantId: string,
    fn: (repo: Repository<WeUserShadow>) => Promise<T>
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      // Set transaction-local tenant context before touching the RLS-protected shadow table.
      await manager.query(`SELECT set_config($1, $2, true)`, [DBVariables.APP_ROLE, DBRoles.TENANT_USER]);
      await manager.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);
      return fn(manager.getRepository(WeUserShadow));
    });
  }
}
