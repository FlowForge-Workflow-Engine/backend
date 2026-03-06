import { Injectable, NotFoundException } from "@nestjs/common";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AuditLog } from "../entities/audit-log.entity";
import { FindAuditLogDto } from "../dto/find-audit-log.dto";

/**
 * Represents a paginated response of audit logs.
 * Used to return audit log data along with pagination metadata.
 */
export interface AuditLogPage {
  /** Array of audit log records for the current page */
  data: AuditLog[];
  /** Total number of audit logs available for the query */
  total: number;
  /** Current page number (1-based) */
  page: number;
  /** Number of records per page */
  limit: number;
}

/**
 * Service for querying audit logs.
 * Provides read-only access to immutable audit trail records for workflow instances.
 * Audit logs are created by the AuditSubscriber when workflow events are published.
 */
@Injectable()
export class AuditService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  /**
   * Retrieves paginated audit logs for a given workflow instance.
   * Returns an immutable audit trail of all state transitions and events for the instance.
   *
   * @param instanceId - The workflow instance ID to fetch audit logs for
   * @param tenantId - The tenant ID (for multi-tenancy isolation)
   * @param page - Page number (1-based) for pagination
   * @param limit - Number of records per page
   * @returns Promise<AuditLogPage> - Paginated audit logs with metadata
   * @throws NotFoundException - If no logs exist for the instance on page 1 (instance not found)
   */
  async getAuditLogs(instanceId: string, tenantId: string, dto: FindAuditLogDto): Promise<AuditLogPage> {
    const { page, limit } = dto;

    const [data, total] = await this.auditLogRepository.findByInstanceId(instanceId, tenantId, page, limit);

    if (total === 0 && page === 1) {
      throw new NotFoundException(AppErrors.AUDIT_LOG_NOT_FOUND);
    }

    return { data, total, page, limit };
  }
}
