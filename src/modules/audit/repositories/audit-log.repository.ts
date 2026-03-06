import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { pagination } from "@app/shared/utils/paginaton";
import { AuditLog } from "../entities/audit-log.entity";

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>
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
}
