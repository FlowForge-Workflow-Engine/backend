/**
 * Unit Tests: AuditController
 * Module: audit
 * Coverage target: 85%+ line and branch
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { AuditController } from "./audit.controller";
import { AuditService } from "../services/audit.service";
import { FindAuditLogDto } from "../dto/find-audit-log.dto";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { MockAuditLog } from "@app/shared/test-utils";
import { AuditLog } from "../entities/audit-log.entity";

describe("AuditController", () => {
  let controller: AuditController;
  let service: jest.Mocked<Pick<AuditService, "getAuditLogs">>;

  const tenantId = "aaaaaaaa-0000-4000-8000-000000000001";
  const instanceId = "11111111-0000-4000-8000-000000000001";

  beforeEach(async () => {
    service = {
      getAuditLogs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: service }],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  afterEach(() => jest.clearAllMocks());

  it("delegates to AuditService.getAuditLogs and wraps {status,count,data}", async () => {
    const dto: FindAuditLogDto = { page: 1, limit: 10 };
    const idParam: IdParamDto = { id: instanceId };

    const data: AuditLog[] = [MockAuditLog as unknown as AuditLog];
    const total = 0;

    service.getAuditLogs.mockResolvedValue({ data, total, page: 1, limit: 10 });

    const result = await controller.getAuditLogs(idParam, tenantId, dto);

    expect(service.getAuditLogs).toHaveBeenCalledWith(instanceId, tenantId, dto);
    expect(result).toEqual({ status: "success", count: total, data });
  });
});

