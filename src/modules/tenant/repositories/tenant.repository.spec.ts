/**
 * Unit Tests: TenantRepository
 * Module: tenant
 * Coverage target: 85%+ line and branch
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { DBRoles } from "@app/database/constants/db-roles.enum";
import { DBVariables } from "@app/database/constants/db-variables.enum";
import { MockTenant, TEST_IDS } from "@app/shared/test-utils";
import { TenantRepository } from "./tenant.repository";
import { Tenant } from "../entities/tenant.entity";

describe("TenantRepository", () => {
  let repo: TenantRepository;
  let requestContext: ReturnType<typeof createMockRequestContextService>;
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    getCount: jest.Mock;
  };
  let entityRepo: {
    query: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    target: typeof Tenant;
  };

  beforeEach(async () => {
    requestContext = createMockRequestContextService();
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };

    entityRepo = {
      query: jest.fn().mockResolvedValue(undefined),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      create: jest.fn((data: unknown) => data),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      target: Tenant,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantRepository,
        { provide: getRepositoryToken(Tenant), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<TenantRepository>(TenantRepository);
  });

  afterEach(() => jest.clearAllMocks());

  it("findAll sets superadmin role and returns paginated tenants", async () => {
    entityRepo.findAndCount.mockResolvedValue([[MockTenant], 1]);

    const result = await repo.findAll({ page: 2, limit: 5 });
    expect(result[1]).toBe(1);
    expect(entityRepo.query).toHaveBeenCalledWith(
      `SELECT set_config('${DBVariables.APP_ROLE}', $1::text, true)`,
      [DBRoles.SUPERADMIN]
    );
    expect(entityRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { createdAt: "DESC" },
        skip: 5,
        take: 5,
      })
    );
  });

  it("findById and findBySlug query expected where clauses", async () => {
    entityRepo.findOne.mockResolvedValue(MockTenant);
    await repo.findById(TEST_IDS.TENANT_A_ID);
    await repo.findBySlug("acme-corp");

    expect(entityRepo.findOne).toHaveBeenNthCalledWith(1, {
      where: { id: TEST_IDS.TENANT_A_ID },
    });
    expect(entityRepo.findOne).toHaveBeenNthCalledWith(2, {
      where: { slug: "acme-corp" },
    });
  });

  it("existsBySlug applies optional excludeId filter", async () => {
    qb.getCount.mockResolvedValueOnce(1);
    const exists = await repo.existsBySlug("acme-corp", TEST_IDS.TENANT_A_ID);
    expect(exists).toBe(true);
    expect(qb.where).toHaveBeenCalledWith("t.slug = :slug", { slug: "acme-corp" });
    expect(qb.andWhere).toHaveBeenCalledWith("t.id != :excludeId", {
      excludeId: TEST_IDS.TENANT_A_ID,
    });
  });
});

