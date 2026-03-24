/**
 * Unit Tests: TenantFeatureFlagRepository
 * Module: tenant
 * Coverage target: 85%+ line and branch
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { MockFeatureFlag, TEST_IDS } from "@app/shared/test-utils";
import { TenantFeatureFlagRepository } from "./tenant-feature-flag.repository";
import { TenantFeatureFlag } from "../entities/tenant-feature-flag.entity";

describe("TenantFeatureFlagRepository", () => {
  let repo: TenantFeatureFlagRepository;
  let entityRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    target: typeof TenantFeatureFlag;
  };

  beforeEach(async () => {
    entityRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data: unknown) => data),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
      target: TenantFeatureFlag,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantFeatureFlagRepository,
        { provide: getRepositoryToken(TenantFeatureFlag), useValue: entityRepo },
        {
          provide: RequestContextService,
          useValue: createMockRequestContextService(),
        },
      ],
    }).compile();

    repo = module.get<TenantFeatureFlagRepository>(TenantFeatureFlagRepository);
  });

  afterEach(() => jest.clearAllMocks());

  it("findByTenantId orders by flagKey ASC", async () => {
    entityRepo.find.mockResolvedValue([MockFeatureFlag]);
    const result = await repo.findByTenantId(TEST_IDS.TENANT_A_ID);
    expect(result).toHaveLength(1);
    expect(entityRepo.find).toHaveBeenCalledWith({
      where: { tenantId: TEST_IDS.TENANT_A_ID },
      order: { flagKey: "ASC" },
    });
  });

  it("isEnabled returns false when flag missing", async () => {
    entityRepo.findOne.mockResolvedValue(null);
    const enabled = await repo.isEnabled(TEST_IDS.TENANT_A_ID, "missing");
    expect(enabled).toBe(false);
  });

  it("upsert creates new row when flag missing", async () => {
    entityRepo.findOne.mockResolvedValue(null);
    entityRepo.save.mockResolvedValue(MockFeatureFlag);

    await repo.upsert(TEST_IDS.TENANT_A_ID, "advanced_reporting", {
      isEnabled: true,
      config: null,
    });

    expect(entityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TEST_IDS.TENANT_A_ID,
        flagKey: "advanced_reporting",
        isEnabled: true,
      })
    );
  });

  it("remove does nothing when row missing", async () => {
    entityRepo.findOne.mockResolvedValue(null);
    await repo.remove(TEST_IDS.TENANT_A_ID, "missing");
    expect(entityRepo.remove).not.toHaveBeenCalled();
  });
});

