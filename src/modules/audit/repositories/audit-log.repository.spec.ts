/**
 * Unit Tests: AuditLogRepository
 * Module: audit
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - TypeORM Repository<AuditLog>: entityRepo mock
 * - RequestContextService: QR fallback for BaseRepository.repo
 * - DataSource.transaction(): verifies tenant-scoped SET ROLE + app.tenant_id config
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { AuditLogRepository } from "./audit-log.repository";
import { AuditLog } from "../entities/audit-log.entity";
import { AuditActionType } from "../enum/audit-action-type.enum";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { DBRoles } from "@app/database/constants/db-roles.enum";
import { DBVariables } from "@app/database/constants/db-variables.enum";

describe("AuditLogRepository", () => {
  let repo: AuditLogRepository;
  let entityRepo: {
    findAndCount: jest.Mock;
  };
  let requestContext: ReturnType<typeof createMockRequestContextService>;
  let dataSource: {
    transaction: jest.Mock;
  };

  beforeEach(async () => {
    entityRepo = {
      findAndCount: jest.fn(),
    };

    requestContext = createMockRequestContextService();

    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogRepository,
        { provide: getRepositoryToken(AuditLog), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    repo = module.get<AuditLogRepository>(AuditLogRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findByInstanceId()", () => {
    it("queries by instanceId + tenantId, orders DESC and applies pagination", async () => {
      entityRepo.findAndCount.mockResolvedValue([[{ id: "a" }], 1]);

      const instanceId = "11111111-0000-4000-8000-000000000001";
      const tenantId = "aaaaaaaa-0000-4000-8000-000000000001";
      const page = 2;
      const limit = 10;
      const skip = (page - 1) * limit;
      const take = limit;

      const result = await repo.findByInstanceId(instanceId, tenantId, page, limit);
      expect(entityRepo.findAndCount).toHaveBeenCalledWith({
        where: { instanceId, tenantId },
        order: { createdAt: "DESC" },
        skip,
        take,
      });

      expect(result[1]).toBe(1);
    });
  });

  describe("insertIfAbsent()", () => {
    it("returns false when an audit row already exists for eventId", async () => {
      const managerRepo = {
        findOne: jest.fn().mockResolvedValue({ id: "existing" }),
        create: jest.fn(),
        save: jest.fn(),
      };

      const manager: Partial<EntityManager> = {
        query: jest.fn(),
        getRepository: jest.fn().mockReturnValue(managerRepo),
      };

      dataSource.transaction.mockImplementation(async (fn: (m: EntityManager) => Promise<boolean>) => {
        return fn(manager as EntityManager);
      });

      const eventId = "44444444-0000-4000-8000-000000000001";
      const tenantId = "aaaaaaaa-0000-4000-8000-000000000001";

      const inserted = await repo.insertIfAbsent(eventId, tenantId, {
        tenantId,
        actionType: AuditActionType.TRANSITION_EXECUTED,
        eventId,
        resourceType: "workflow_instance",
        resourceId: "11111111-0000-4000-8000-000000000001",
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.query).toHaveBeenCalledWith(`SELECT set_config($1, $2, true)`, [
        DBVariables.APP_ROLE,
        DBRoles.TENANT_USER,
      ]);
      expect(manager.query).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1::text, true)",
        [tenantId]
      );

      expect(managerRepo.findOne).toHaveBeenCalledWith({ where: { eventId, tenantId } });
      expect(managerRepo.save).not.toHaveBeenCalled();
      expect(inserted).toBe(false);
    });

    it("returns true and inserts when no audit row exists", async () => {
      const managerRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((data: unknown) => data),
        save: jest.fn().mockResolvedValue({}),
      };

      const manager: Partial<EntityManager> = {
        query: jest.fn(),
        getRepository: jest.fn().mockReturnValue(managerRepo),
      };

      dataSource.transaction.mockImplementation(async (fn: (m: EntityManager) => Promise<boolean>) => {
        return fn(manager as EntityManager);
      });

      const eventId = "44444444-0000-4000-8000-000000000001";
      const tenantId = "aaaaaaaa-0000-4000-8000-000000000001";

      const inserted = await repo.insertIfAbsent(eventId, tenantId, {
        tenantId,
        actionType: AuditActionType.TRANSITION_EXECUTED,
        eventId,
        resourceType: "workflow_instance",
        resourceId: "11111111-0000-4000-8000-000000000001",
      });

      expect(managerRepo.findOne).toHaveBeenCalledWith({ where: { eventId, tenantId } });
      expect(managerRepo.create).toHaveBeenCalled();
      expect(managerRepo.save).toHaveBeenCalled();
      expect(inserted).toBe(true);
    });
  });
});

