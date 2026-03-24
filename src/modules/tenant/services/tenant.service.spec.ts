/**
 * Unit Tests: TenantService
 * Module: tenant
 * Coverage target: 85%+ line and branch
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { CacheKeys } from "../../../infra/cache-keys";
import {
  MockFeatureFlag,
  MockTenant,
  MockTenantSettings,
  TEST_IDS,
} from "@app/shared/test-utils";
import { TenantService } from "./tenant.service";
import { TenantRepository } from "../repositories/tenant.repository";
import { TenantSettingsRepository } from "../repositories/tenant-settings.repository";
import { TenantFeatureFlagRepository } from "../repositories/tenant-feature-flag.repository";
import { TenantPublisher } from "../publishers/tenant.publisher";
import { RedisService } from "../../../infra/redis.service";
import { Tenant, TenantPlan } from "../entities/tenant.entity";
import { TenantSettings } from "../entities/tenant-settings.entity";
import { TenantFeatureFlag } from "../entities/tenant-feature-flag.entity";
import { CreateTenantDto } from "../dto/create-tenant.dto";
import { FindTenantDto } from "../dto/find-tenant.dto";
import { UpdateTenantDto } from "../dto/update-tenant.dto";
import { UpdateTenantSettingsDto } from "../dto/update-tenant-settings.dto";
import { CreateFeatureFlagDto } from "../dto/create-feature-flag.dto";
import { UpdateFeatureFlagDto } from "../dto/update-feature-flag.dto";

import * as uuidUtil from "@app/shared/utils/uuid.util";
jest.mock("@app/shared/utils/uuid.util");

const mockGenerateUUID = uuidUtil.generateUUID as jest.MockedFunction<
  typeof uuidUtil.generateUUID
>;

describe("TenantService", () => {
  let service: TenantService;
  let redis: ReturnType<typeof createMockRedisService>;

  let tenantRepository: {
    existsBySlug: jest.MockedFunction<TenantRepository["existsBySlug"]>;
    create: jest.MockedFunction<TenantRepository["create"]>;
    save: jest.MockedFunction<TenantRepository["save"]>;
    findAll: jest.MockedFunction<TenantRepository["findAll"]>;
    findById: jest.MockedFunction<TenantRepository["findById"]>;
  };

  let settingsRepository: {
    upsert: jest.MockedFunction<TenantSettingsRepository["upsert"]>;
  };

  let featureFlagRepository: {
    findByTenantId: jest.MockedFunction<TenantFeatureFlagRepository["findByTenantId"]>;
    findByTenantIdAndKey: jest.MockedFunction<
      TenantFeatureFlagRepository["findByTenantIdAndKey"]
    >;
    upsert: jest.MockedFunction<TenantFeatureFlagRepository["upsert"]>;
    remove: jest.MockedFunction<TenantFeatureFlagRepository["remove"]>;
  };

  let publisher: {
    publishTenantCreated: jest.MockedFunction<
      TenantPublisher["publishTenantCreated"]
    >;
    publishTenantPlanUpdated: jest.MockedFunction<
      TenantPublisher["publishTenantPlanUpdated"]
    >;
    publishTenantDeactivated: jest.MockedFunction<
      TenantPublisher["publishTenantDeactivated"]
    >;
  };

  beforeEach(async () => {
    mockGenerateUUID.mockReturnValue("event-uuid");
    redis = createMockRedisService();

    tenantRepository = {
      existsBySlug: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
    };

    settingsRepository = {
      upsert: jest.fn(),
    };

    featureFlagRepository = {
      findByTenantId: jest.fn(),
      findByTenantIdAndKey: jest.fn(),
      upsert: jest.fn(),
      remove: jest.fn(),
    };

    publisher = {
      publishTenantCreated: jest.fn(),
      publishTenantPlanUpdated: jest.fn(),
      publishTenantDeactivated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: TenantRepository, useValue: tenantRepository },
        { provide: TenantSettingsRepository, useValue: settingsRepository },
        { provide: TenantFeatureFlagRepository, useValue: featureFlagRepository },
        { provide: TenantPublisher, useValue: publisher },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("verifyUserBelongsToTenant()", () => {
    it("throws ForbiddenException when tenant mismatch", () => {
      expect(() =>
        service.verifyUserBelongsToTenant("t1", "t2")
      ).toThrow(ForbiddenException);
    });

    it("does nothing when tenant matches", () => {
      expect(() =>
        service.verifyUserBelongsToTenant("t1", "t1")
      ).not.toThrow();
    });
  });

  describe("create()", () => {
    it("throws ConflictException when slug already exists", async () => {
      tenantRepository.existsBySlug.mockResolvedValue(true);
      const dto: CreateTenantDto = {
        name: "Acme",
        slug: "acme",
        plan: TenantPlan.PRO,
      };

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(AppErrors.TENANT_SLUG_TAKEN);
    });

    it("creates tenant, bootstraps settings, and publishes event", async () => {
      const dto: CreateTenantDto = {
        name: "Acme",
        slug: "acme",
        plan: TenantPlan.PRO,
      };

      tenantRepository.existsBySlug.mockResolvedValue(false);
      tenantRepository.create.mockReturnValue(MockTenant as unknown as Tenant);
      tenantRepository.save.mockResolvedValue({
        ...(MockTenant as unknown as Tenant),
        id: TEST_IDS.TENANT_A_ID,
        name: dto.name,
        slug: dto.slug,
      });
      settingsRepository.upsert.mockResolvedValue(
        MockTenantSettings as unknown as TenantSettings
      );

      const result = await service.create(dto);

      expect(result.id).toBe(TEST_IDS.TENANT_A_ID);
      expect(settingsRepository.upsert).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID, {});
      expect(publisher.publishTenantCreated).toHaveBeenCalledTimes(1);
      const [eventPayload] = publisher.publishTenantCreated.mock.calls[0];
      expect(eventPayload.eventId).toBe("event-uuid");
      expect(eventPayload.tenantId).toBe(TEST_IDS.TENANT_A_ID);
      expect(eventPayload.slug).toBe("acme");
    });
  });

  describe("findAll()", () => {
    it("returns paginated result from repository", async () => {
      const dto: FindTenantDto = { page: 1, limit: 10 };
      const tenants: Tenant[] = [MockTenant as unknown as Tenant];
      tenantRepository.findAll.mockResolvedValue([tenants, 1]);

      const result = await service.findAll(dto);
      expect(result).toEqual({ data: tenants, total: 1 });
      expect(tenantRepository.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });
  });

  describe("findById()", () => {
    it("throws NotFoundException when tenant missing", async () => {
      tenantRepository.findById.mockResolvedValue(null);
      await expect(service.findById(TEST_IDS.TENANT_A_ID)).rejects.toThrow(NotFoundException);
      await expect(service.findById(TEST_IDS.TENANT_A_ID)).rejects.toThrow(AppErrors.TENANT_NOT_FOUND);
    });
  });

  describe("update()", () => {
    it("updates tenant, invalidates cache, and publishes plan-changed + deactivated events", async () => {
      const tenant = {
        ...(MockTenant as unknown as Tenant),
        id: TEST_IDS.TENANT_A_ID,
        plan: TenantPlan.FREE,
        isActive: true,
      };
      tenantRepository.findById.mockResolvedValue(tenant);
      tenantRepository.save.mockResolvedValue({
        ...tenant,
        plan: TenantPlan.PRO,
        isActive: false,
      });

      const dto: UpdateTenantDto = { plan: TenantPlan.PRO, isActive: false };

      const result = await service.update(TEST_IDS.TENANT_A_ID, TEST_IDS.TENANT_A_ID, dto);

      expect(result.plan).toBe("pro");
      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.tenantById(TEST_IDS.TENANT_A_ID),
        CacheKeys.tenantPlan(TEST_IDS.TENANT_A_ID)
      );
      expect(publisher.publishTenantPlanUpdated).toHaveBeenCalledTimes(1);
      expect(publisher.publishTenantDeactivated).toHaveBeenCalledTimes(1);
    });
  });

  describe("deactivate()", () => {
    it("deactivates tenant, invalidates caches, and publishes event", async () => {
      const tenant = {
        ...(MockTenant as unknown as Tenant),
        id: TEST_IDS.TENANT_A_ID,
        isActive: true,
      };
      tenantRepository.findById.mockResolvedValue(tenant);
      tenantRepository.save.mockResolvedValue({ ...tenant, isActive: false });

      const result = await service.deactivate(TEST_IDS.TENANT_A_ID, TEST_IDS.TENANT_A_ID);
      expect(result.isActive).toBe(false);
      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.tenantById(TEST_IDS.TENANT_A_ID),
        CacheKeys.tenantPlan(TEST_IDS.TENANT_A_ID)
      );
      expect(publisher.publishTenantDeactivated).toHaveBeenCalledTimes(1);
    });
  });

  describe("settings + feature flags", () => {
    it("getSettings upserts defaults after tenant exists", async () => {
      tenantRepository.findById.mockResolvedValue(MockTenant as unknown as Tenant);
      settingsRepository.upsert.mockResolvedValue(MockTenantSettings as unknown as TenantSettings);

      const result = await service.getSettings(TEST_IDS.TENANT_A_ID);
      expect(result).toBeDefined();
      expect(settingsRepository.upsert).toHaveBeenCalledWith(TEST_IDS.TENANT_A_ID, {});
    });

    it("createFeatureFlag throws ConflictException when key already exists", async () => {
      tenantRepository.findById.mockResolvedValue(MockTenant as unknown as Tenant);
      featureFlagRepository.findByTenantIdAndKey.mockResolvedValue(
        MockFeatureFlag as unknown as TenantFeatureFlag
      );

      const dto: CreateFeatureFlagDto = {
        flagKey: "advanced_reporting",
        isEnabled: true,
        config: null,
      };

      await expect(
        service.createFeatureFlag(TEST_IDS.TENANT_A_ID, TEST_IDS.TENANT_A_ID, dto)
      ).rejects.toThrow(ConflictException);
    });

    it("updateFeatureFlag throws NotFoundException when flag missing", async () => {
      tenantRepository.findById.mockResolvedValue(MockTenant as unknown as Tenant);
      featureFlagRepository.findByTenantIdAndKey.mockResolvedValue(null);

      const dto: UpdateFeatureFlagDto = { isEnabled: true };
      await expect(
        service.updateFeatureFlag(TEST_IDS.TENANT_A_ID, TEST_IDS.TENANT_A_ID, "missing", dto)
      ).rejects.toThrow(NotFoundException);
    });

    it("deleteFeatureFlag removes and invalidates cache", async () => {
      tenantRepository.findById.mockResolvedValue(MockTenant as unknown as Tenant);
      featureFlagRepository.findByTenantIdAndKey.mockResolvedValue(
        MockFeatureFlag as unknown as TenantFeatureFlag
      );
      featureFlagRepository.remove.mockResolvedValue(undefined);

      await service.deleteFeatureFlag(
        TEST_IDS.TENANT_A_ID,
        TEST_IDS.TENANT_A_ID,
        "advanced_reporting"
      );

      expect(featureFlagRepository.remove).toHaveBeenCalledWith(
        TEST_IDS.TENANT_A_ID,
        "advanced_reporting"
      );
      expect(redis.del).toHaveBeenCalledWith(CacheKeys.tenantFeatureFlags(TEST_IDS.TENANT_A_ID));
    });
  });
});

