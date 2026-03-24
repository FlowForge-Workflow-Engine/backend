/**
 * Unit Tests: TenantSettingsRepository
 * Module: tenant
 * Coverage target: 85%+ line and branch
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { MockTenantSettings, TEST_IDS } from "@app/shared/test-utils";
import { TenantSettingsRepository } from "./tenant-settings.repository";
import { TenantSettings } from "../entities/tenant-settings.entity";

describe("TenantSettingsRepository", () => {
  let repo: TenantSettingsRepository;
  let entityRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    target: typeof TenantSettings;
  };

  beforeEach(async () => {
    entityRepo = {
      findOne: jest.fn(),
      create: jest.fn((data: unknown) => data),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      target: TenantSettings,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantSettingsRepository,
        { provide: getRepositoryToken(TenantSettings), useValue: entityRepo },
        {
          provide: RequestContextService,
          useValue: createMockRequestContextService(),
        },
      ],
    }).compile();

    repo = module.get<TenantSettingsRepository>(TenantSettingsRepository);
  });

  afterEach(() => jest.clearAllMocks());

  it("upsert creates default settings when none exist", async () => {
    entityRepo.findOne.mockResolvedValue(null);
    entityRepo.save.mockResolvedValue(MockTenantSettings);

    const result = await repo.upsert(TEST_IDS.TENANT_A_ID, {});
    expect(result).toBeDefined();
    expect(entityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TEST_IDS.TENANT_A_ID,
        maxWorkflowDefinitions: 10,
        maxUsers: 50,
        branding: null,
        timezone: "UTC",
      })
    );
  });

  it("upsert merges update data when settings already exist", async () => {
    const existing = { ...MockTenantSettings };
    entityRepo.findOne.mockResolvedValue(existing);
    entityRepo.save.mockResolvedValue(existing);

    await repo.upsert(TEST_IDS.TENANT_A_ID, { maxUsers: 99 });

    expect(entityRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ maxUsers: 99 })
    );
  });
});

