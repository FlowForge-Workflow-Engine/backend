/**
 * Unit Tests: TenantQueryService
 * Module: tenant
 * Coverage target: 85%+ line and branch
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";
import { MockFeatureFlag, MockTenant, TEST_IDS } from "@app/shared/test-utils";
import { TenantQueryService } from "./tenant-query.service";
import { TenantRepository } from "../repositories/tenant.repository";
import { TenantFeatureFlagRepository } from "../repositories/tenant-feature-flag.repository";
import { RedisService } from "../../../infra/redis.service";
import { Tenant } from "../entities/tenant.entity";
import { TenantFeatureFlag } from "../entities/tenant-feature-flag.entity";

describe("TenantQueryService", () => {
  let service: TenantQueryService;
  let redis: ReturnType<typeof createMockRedisService>;

  let tenantRepository: {
    findById: jest.MockedFunction<TenantRepository["findById"]>;
    findBySlug: jest.MockedFunction<TenantRepository["findBySlug"]>;
  };

  let featureFlagRepository: {
    findByTenantId: jest.MockedFunction<TenantFeatureFlagRepository["findByTenantId"]>;
  };

  beforeEach(async () => {
    redis = createMockRedisService();

    tenantRepository = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
    };

    featureFlagRepository = {
      findByTenantId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantQueryService,
        { provide: TenantRepository, useValue: tenantRepository },
        { provide: TenantFeatureFlagRepository, useValue: featureFlagRepository },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<TenantQueryService>(TenantQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findById()", () => {
    it("returns cached tenant summary on cache hit", async () => {
      const cached = {
        id: TEST_IDS.TENANT_A_ID,
        name: "Acme",
        slug: "acme",
        plan: "pro",
        isActive: true,
      };
      redis.get.mockResolvedValueOnce(cached);

      const result = await service.findById(TEST_IDS.TENANT_A_ID);
      expect(result).toEqual(cached);
      expect(tenantRepository.findById).not.toHaveBeenCalled();
    });

    it("loads from repository on cache miss and stores MEDIUM TTL", async () => {
      redis.get.mockResolvedValueOnce(null);
      tenantRepository.findById.mockResolvedValue(MockTenant as unknown as Tenant);

      const result = await service.findById(TEST_IDS.TENANT_A_ID);
      expect(result?.id).toBe(TEST_IDS.TENANT_A_ID);
      expect(redis.set).toHaveBeenCalledWith(
        CacheKeys.tenantById(TEST_IDS.TENANT_A_ID),
        expect.objectContaining({ id: TEST_IDS.TENANT_A_ID }),
        CacheTTL.MEDIUM
      );
    });
  });

  describe("findBySlug()", () => {
    it("returns null when tenant not found", async () => {
      redis.get.mockResolvedValueOnce(null);
      tenantRepository.findBySlug.mockResolvedValue(null);

      const result = await service.findBySlug("missing");
      expect(result).toBeNull();
    });
  });

  describe("isFeatureEnabled()", () => {
    it("returns cached value when feature map exists in cache", async () => {
      redis.get.mockResolvedValueOnce({ advanced_reporting: true });
      const result = await service.isFeatureEnabled(TEST_IDS.TENANT_A_ID, "advanced_reporting");
      expect(result).toBe(true);
      expect(featureFlagRepository.findByTenantId).not.toHaveBeenCalled();
    });

    it("builds feature flag map on cache miss and returns false for unknown key", async () => {
      redis.get.mockResolvedValueOnce(null);
      featureFlagRepository.findByTenantId.mockResolvedValue([
        MockFeatureFlag as unknown as TenantFeatureFlag,
      ]);

      const result = await service.isFeatureEnabled(TEST_IDS.TENANT_A_ID, "missing_flag");
      expect(result).toBe(false);
      expect(redis.set).toHaveBeenCalledWith(
        CacheKeys.tenantFeatureFlags(TEST_IDS.TENANT_A_ID),
        expect.objectContaining({ advanced_reporting: true }),
        CacheTTL.SHORT
      );
    });
  });

  describe("getPlan()", () => {
    it("returns cached plan on hit", async () => {
      redis.get.mockResolvedValueOnce("enterprise");
      const result = await service.getPlan(TEST_IDS.TENANT_A_ID);
      expect(result).toBe("enterprise");
      expect(tenantRepository.findById).not.toHaveBeenCalled();
    });

    it("returns fallback 'free' when tenant missing", async () => {
      redis.get.mockResolvedValueOnce(null);
      tenantRepository.findById.mockResolvedValue(null);

      const result = await service.getPlan(TEST_IDS.TENANT_A_ID);
      expect(result).toBe("free");
      expect(redis.set).toHaveBeenCalledWith(
        CacheKeys.tenantPlan(TEST_IDS.TENANT_A_ID),
        "free",
        CacheTTL.MEDIUM
      );
    });
  });
});

