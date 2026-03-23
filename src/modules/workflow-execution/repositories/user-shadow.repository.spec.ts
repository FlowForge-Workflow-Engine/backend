import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { TEST_IDS } from "@app/shared/test-utils";
import { UserShadowRepository } from "./user-shadow.repository";
import { WeUserShadow } from "../entities/we-user-shadow.entity";

describe("UserShadowRepository", () => {
  let repo: UserShadowRepository;
  let dataSource: { transaction: jest.Mock };
  let manager: { query: jest.Mock; getRepository: jest.Mock };
  let scopedRepo: { createQueryBuilder: jest.Mock; update: jest.Mock };
  let qb: {
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    orUpdate: jest.Mock;
    execute: jest.Mock;
  };

  beforeEach(async () => {
    qb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    scopedRepo = {
      createQueryBuilder: jest.fn(() => qb),
      update: jest.fn().mockResolvedValue(undefined),
    };
    manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(scopedRepo),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (em: typeof manager) => Promise<void>) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserShadowRepository,
        {
          provide: getRepositoryToken(WeUserShadow),
          useValue: { findOne: jest.fn(), target: WeUserShadow },
        },
        { provide: RequestContextService, useValue: createMockRequestContextService() },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    repo = module.get<UserShadowRepository>(UserShadowRepository);
  });

  it("upsert writes through tenant-scoped transaction", async () => {
    await repo.upsert({
      id: TEST_IDS.REQUESTOR_USER_ID,
      tenantId: TEST_IDS.TENANT_A_ID,
      email: "u@acme.com",
      fullName: "User One",
      roles: ["Requestor"],
      isActive: true,
      syncedAt: new Date(),
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(qb.execute).toHaveBeenCalledTimes(1);
  });

  it("updateRoles updates tenant scoped shadow row", async () => {
    await repo.updateRoles(TEST_IDS.REQUESTOR_USER_ID, TEST_IDS.TENANT_A_ID, ["Approver"], new Date());
    expect(scopedRepo.update).toHaveBeenCalledWith(
      { id: TEST_IDS.REQUESTOR_USER_ID, tenantId: TEST_IDS.TENANT_A_ID },
      expect.objectContaining({ roles: ["Approver"] })
    );
  });

  it("deactivate marks shadow inactive", async () => {
    await repo.deactivate(TEST_IDS.REQUESTOR_USER_ID, TEST_IDS.TENANT_A_ID, new Date());
    expect(scopedRepo.update).toHaveBeenCalledWith(
      { id: TEST_IDS.REQUESTOR_USER_ID, tenantId: TEST_IDS.TENANT_A_ID },
      expect.objectContaining({ isActive: false })
    );
  });
});

