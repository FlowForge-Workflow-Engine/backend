import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtStrategy } from "./jwt.strategy";
import { UserRepository } from "../repositories/user.repository";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";
import { createMockRedisService, createMockConfigService } from "@app/shared/test-utils/mocks";
import { makeUser, makeUserRole, makeJwtPayload, TEST_IDS } from "@app/shared/test-utils";

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;
  let redis: ReturnType<typeof createMockRedisService>;
  let userRepository: jest.Mocked<Pick<UserRepository, "findByIdAndTenantWithRolesForJwtStretegy">>;

  const TENANT_ID = TEST_IDS.TENANT_ID;
  const USER_ID = TEST_IDS.USER_ID;
  const ROLE_ID = TEST_IDS.ADMIN_ROLE_ID;
  const cacheKey = CacheKeys.jwtUser(TENANT_ID, USER_ID);

  const basePayload = makeJwtPayload() as any;

  beforeEach(async () => {
    redis = createMockRedisService();
    userRepository = {
      findByIdAndTenantWithRolesForJwtStretegy: jest.fn(),
    } as any;

    const configService = createMockConfigService({ JWT_SECRET: "test-secret" });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configService },
        { provide: RedisService, useValue: redis },
        { provide: UserRepository, useValue: userRepository },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validate — guard rails ──────────────────────────────────────────────────
  describe("validate() — guard rails", () => {
    it("throws UnauthorizedException when payload.sub is missing", async () => {
      await expect(strategy.validate({ ...basePayload, sub: undefined } as any)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it("throws UnauthorizedException when payload.tenantId is missing", async () => {
      await expect(strategy.validate({ ...basePayload, tenantId: undefined } as any)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  // ─── validate — cache hit ────────────────────────────────────────────────────
  describe("validate() — Redis cache hit", () => {
    it("returns payload with cached roleIds when cache contains valid entry", async () => {
      const cached = { isActive: true, roleIds: [ROLE_ID] };
      redis.get.mockResolvedValue(cached);

      const result = await strategy.validate(basePayload);

      expect(redis.get).toHaveBeenCalledWith(cacheKey);
      expect(userRepository.findByIdAndTenantWithRolesForJwtStretegy).not.toHaveBeenCalled();
      expect(result.roleIds).toEqual([ROLE_ID]);
    });

    it("uses payload.roleIds if already present and cache is valid", async () => {
      const cached = { isActive: true, roleIds: ["other-role"] };
      redis.get.mockResolvedValue(cached);

      const payloadWithRoles = { ...basePayload, roleIds: [ROLE_ID] };
      const result = await strategy.validate(payloadWithRoles);

      expect(result.roleIds).toEqual([ROLE_ID]);
    });

    it("throws UnauthorizedException when cached user is deactivated", async () => {
      redis.get.mockResolvedValue({ isActive: false, roleIds: [ROLE_ID] });

      await expect(strategy.validate(basePayload)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── validate — cache miss → DB fallback ────────────────────────────────────
  describe("validate() — cache miss, DB fallback", () => {
    it("fetches user from DB on cache miss and sets cache with SHORT TTL", async () => {
      redis.get.mockResolvedValue(null);
      const userWithRole = makeUser({ userRoles: [makeUserRole({ roleId: ROLE_ID })] }) as any;
      (userRepository.findByIdAndTenantWithRolesForJwtStretegy as jest.Mock).mockResolvedValue(userWithRole);

      const result = await strategy.validate({ ...basePayload, roleIds: undefined as any });

      expect(userRepository.findByIdAndTenantWithRolesForJwtStretegy).toHaveBeenCalledWith(USER_ID, TENANT_ID);
      expect(redis.set).toHaveBeenCalledWith(
        cacheKey,
        { isActive: true, roleIds: [ROLE_ID] },
        CacheTTL.SHORT
      );
      expect(result.roleIds).toEqual([ROLE_ID]);
    });

    it("throws UnauthorizedException when user is not found in DB", async () => {
      redis.get.mockResolvedValue(null);
      (userRepository.findByIdAndTenantWithRolesForJwtStretegy as jest.Mock).mockResolvedValue(null);

      await expect(strategy.validate(basePayload)).rejects.toThrow(UnauthorizedException);
    });

    it("fetches from DB when cached entry has no roleIds array (malformed cache)", async () => {
      redis.get.mockResolvedValue({ isActive: true, roleIds: null });
      const userWithRole = makeUser({ userRoles: [makeUserRole({ roleId: ROLE_ID })] }) as any;
      (userRepository.findByIdAndTenantWithRolesForJwtStretegy as jest.Mock).mockResolvedValue(userWithRole);

      await strategy.validate({ ...basePayload, roleIds: undefined as any });

      expect(userRepository.findByIdAndTenantWithRolesForJwtStretegy).toHaveBeenCalled();
    });
  });
});

