import { Injectable, NotFoundException } from '@nestjs/common';
import { AppErrors } from '@app/shared/constants/app-errors.enum';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { AuditLog } from '../entities/audit-log.entity';

export interface AuditLogPage {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  /**
   * Returns paginated audit logs for a given workflow instance.
   * Throws 404 if no logs exist (i.e. the instanceId is unknown to this tenant).
   */
  async getAuditLogs(
    instanceId: string,
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<AuditLogPage> {
    const [data, total] = await this.auditLogRepository.findByInstanceId(
      instanceId,
      tenantId,
      page,
      limit,
    );

    if (total === 0 && page === 1) {
      throw new NotFoundException(AppErrors.AUDIT_LOG_NOT_FOUND);
    }

    return { data, total, page, limit };
  }
}

