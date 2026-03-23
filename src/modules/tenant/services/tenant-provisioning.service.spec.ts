/**
 * Unit Tests: TenantProvisioningService
 * Module: tenant
 * Coverage target: 85%+ line and branch
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { ConflictException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { MockTenant, MockTenantSettings, TEST_IDS } from "@app/shared/test-utils";
import { TenantProvisioningService } from "./tenant-provisioning.service";
import { TenantRepository } from "../repositories/tenant.repository";
import { TenantSettingsRepository } from "../repositories/tenant-settings.repository";
import { RequestContextService } from "@app/database";
import { Tenant, TenantPlan } from "../entities/tenant.entity";
import { TenantSettings } from "../entities/tenant-settings.entity";

describe("TenantProvisioningService", () => {
  let service: TenantProvisioningService;
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  let tenantRepository: {
    existsBySlug: jest.MockedFunction<TenantRepository["existsBySlug"]>;
    create: jest.MockedFunction<TenantRepository["create"]>;
    save: jest.MockedFunction<TenantRepository["save"]>;
  };

  let settingsRepository: {
    upsert: jest.MockedFunction<TenantSettingsRepository["upsert"]>;
  };

  beforeEach(async () => {
    requestContext = createMockRequestContextService();

    tenantRepository = {
      existsBySlug: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    settingsRepository = {
      upsert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantProvisioningService,
        { provide: TenantRepository, useValue: tenantRepository },
        { provide: TenantSettingsRepository, useValue: settingsRepository },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    service = module.get<TenantProvisioningService>(TenantProvisioningService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("provision()", () => {
    it("throws ConflictException when slug already exists", async () => {
      tenantRepository.existsBySlug.mockResolvedValue(true);

      await expect(
        service.provision({ name: "Acme", slug: "acme", plan: "pro" })
      ).rejects.toThrow(ConflictException);

      await expect(
        service.provision({ name: "Acme", slug: "acme", plan: "pro" })
      ).rejects.toThrow(AppErrors.TENANT_SLUG_TAKEN);
    });

    it("throws when QueryRunner is missing in request context", async () => {
      tenantRepository.existsBySlug.mockResolvedValue(false);
      tenantRepository.create.mockReturnValue(MockTenant as unknown as Tenant);
      tenantRepository.save.mockResolvedValue({
        ...(MockTenant as unknown as Tenant),
        id: TEST_IDS.TENANT_A_ID,
        slug: "acme",
      });
      requestContext.getQueryRunner.mockReturnValue(undefined);

      await expect(
        service.provision({ name: "Acme", slug: "acme", plan: "pro" })
      ).rejects.toThrow("QueryRunner not set in request context");
    });

    it("creates tenant, sets tenant context on queryRunner, bootstraps settings, and returns summary", async () => {
      const queryRunner = { query: jest.fn().mockResolvedValue(undefined) };
      requestContext.getQueryRunner.mockReturnValue(
        queryRunner as unknown as ReturnType<ReturnType<typeof createMockRequestContextService>["getQueryRunner"]>
      );

      tenantRepository.existsBySlug.mockResolvedValue(false);
      tenantRepository.create.mockReturnValue(MockTenant as unknown as Tenant);
      tenantRepository.save.mockResolvedValue({
        ...(MockTenant as unknown as Tenant),
        id: TEST_IDS.TENANT_A_ID,
        name: "Acme",
        slug: "acme",
        plan: TenantPlan.PRO,
      });
      settingsRepository.upsert.mockResolvedValue(MockTenantSettings as unknown as TenantSettings);

      const result = await service.provision({ name: "Acme", slug: "acme", plan: "pro" });

      expect(requestContext.setTenantId).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID);
      expect(queryRunner.query).toHaveBeenCalledWith(
        `SELECT set_config('app.tenant_id', $1::text, true)`,
        [TEST_IDS.TENANT_A_ID]
      );
      expect(settingsRepository.upsert).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID, {});
      expect(result).toEqual({
        id: TEST_IDS.TENANT_A_ID,
        name: "Acme",
        slug: "acme",
        plan: TenantPlan.PRO,
      });
    });
  });
});

