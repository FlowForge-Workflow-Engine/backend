/**
 * Unit Tests: AuditService
 * Module: audit
 * Coverage target: 85%+ line and branch
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "./audit.service";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { FindAuditLogDto } from "../dto/find-audit-log.dto";

import { MockAuditLog } from "@app/shared/test-utils";
import { AuditLog } from "../entities/audit-log.entity";

describe("AuditService", () => {
  let service: AuditService;
  let repo: jest.Mocked<Pick<AuditLogRepository, "findByInstanceId">>;

  beforeEach(async () => {
    repo = {
      findByInstanceId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: AuditLogRepository, useValue: repo },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("getAuditLogs()", () => {
    const instanceId = "11111111-0000-4000-8000-000000000001";
    const tenantId = "aaaaaaaa-0000-4000-8000-000000000001";

    it("returns paginated logs and metadata", async () => {
      const page = 2;
      const limit = 20;
      const dto: FindAuditLogDto = { page, limit };

      const logs: AuditLog[] = [MockAuditLog as unknown as AuditLog];
      const total = 101;

      repo.findByInstanceId.mockResolvedValue([logs, total]);

      const result = await service.getAuditLogs(instanceId, tenantId, dto);

      expect(repo.findByInstanceId).toHaveBeenCalledWith(instanceId, tenantId, page, limit);
      expect(result).toEqual({
        data: logs,
        total,
        page,
        limit,
      });
    });

    it("throws AUDIT_LOG_NOT_FOUND when total=0 and page=1", async () => {
      const dto: FindAuditLogDto = { page: 1, limit: 10 };
      repo.findByInstanceId.mockResolvedValue([[], 0]);

      await expect(service.getAuditLogs(instanceId, tenantId, dto)).rejects.toThrow(NotFoundException);
      await expect(service.getAuditLogs(instanceId, tenantId, dto)).rejects.toThrow(AppErrors.AUDIT_LOG_NOT_FOUND);
    });

    it("returns empty data when total=0 but page!=1", async () => {
      const dto: FindAuditLogDto = { page: 2, limit: 10 };
      repo.findByInstanceId.mockResolvedValue([[], 0]);

      const result = await service.getAuditLogs(instanceId, tenantId, dto);
      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });
  });
});

