import { Test, TestingModule } from "@nestjs/testing";
import { UserQueryService } from "./user-query.service";
import { UserRepository } from "../repositories/user.repository";
import { RedisService } from "../../../infra/redis.service";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { makeUser, makeUserRole, makeRole, TEST_IDS } from "@app/shared/test-utils";
import { CacheKeys } from "../../../infra/cache-keys";
import { CacheTTL } from "../../../infra/cache-ttl";

describe("UserQueryService", () => {
  let service: UserQueryService;
  let userRepo: jest.Mocked<UserRepository>;
  let redis: ReturnType<typeof createMockRedisService>;

  const TENANT_ID = TEST_IDS.TENANT_ID;
  const USER_ID = TEST_IDS.USER_ID;
  const SECOND_USER_ID = TEST_IDS.SECOND_USER_ID;

  const userWithRoles = {
    ...makeUser(),
    userRoles: [makeUserRole()],
  };

  const expectedSummary = {
    id: USER_ID,
    email: "alice@acme.com",
    firstName: "Alice",
    lastName: "Smith",
    fullName: "Alice Smith",
    roles: ["Admin"],
    isActive: true,
  };

  beforeEach(async () => {
    userRepo = {
      findByIdWithRoles: jest.fn(),
      findManyByIds: jest.fn(),
      countByTenant: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    redis = createMockRedisService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserQueryService,
        { provide: UserRepository, useValue: userRepo },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<UserQueryService>(UserQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────
  // findById()
  // ────────────────────────────────────────────────────────────────
  describe("findById()", () => {
    it("returns cached summary without hitting the database", async () => {
      redis.get.mockResolvedValue(expectedSummary as any);

      const result = await service.findById(USER_ID, TENANT_ID);

      expect(redis.get).toHaveBeenCalledWith(CacheKeys.userSummary(TENANT_ID, USER_ID));
      expect(userRepo.findByIdWithRoles).not.toHaveBeenCalled();
      expect(result).toEqual(expectedSummary);
    });

    it("fetches from DB on cache miss, sets cache, and returns summary", async () => {
      redis.get.mockResolvedValue(null);
      userRepo.findByIdWithRoles.mockResolvedValue(userWithRoles as any);

      const result = await service.findById(USER_ID, TENANT_ID);

      expect(userRepo.findByIdWithRoles).toHaveBeenCalledWith(USER_ID, TENANT_ID);
      expect(redis.set).toHaveBeenCalledWith(
        CacheKeys.userSummary(TENANT_ID, USER_ID),
        expect.objectContaining({ id: USER_ID, roles: ["Admin"] }),
        CacheTTL.MEDIUM
      );
      expect(result).toMatchObject({ id: USER_ID, roles: ["Admin"] });
    });

    it("returns null when user does not exist in DB", async () => {
      redis.get.mockResolvedValue(null);
      userRepo.findByIdWithRoles.mockResolvedValue(null);

      const result = await service.findById("nonexistent", TENANT_ID);

      expect(result).toBeNull();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("maps empty userRoles to empty roles array", async () => {
      redis.get.mockResolvedValue(null);
      userRepo.findByIdWithRoles.mockResolvedValue({ ...makeUser(), userRoles: [] } as any);

      const result = await service.findById(USER_ID, TENANT_ID);

      expect(result?.roles).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // findManyByIds()
  // ────────────────────────────────────────────────────────────────
  describe("findManyByIds()", () => {
    it("returns cached summaries for all IDs without DB call", async () => {
      const summary2 = { ...expectedSummary, id: SECOND_USER_ID };
      redis.get
        .mockResolvedValueOnce(expectedSummary as any)
        .mockResolvedValueOnce(summary2 as any);

      const result = await service.findManyByIds([USER_ID, SECOND_USER_ID], TENANT_ID);

      expect(userRepo.findManyByIds).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it("queries DB only for cache misses and populates cache", async () => {
      redis.get
        .mockResolvedValueOnce(expectedSummary as any) // USER_ID → cache hit
        .mockResolvedValueOnce(null);                  // SECOND_USER_ID → miss

      const secondUser = {
        ...makeUser({ id: SECOND_USER_ID, email: "bob@acme.com", firstName: "Bob", lastName: "Jones" }),
        userRoles: [makeUserRole({ role: makeRole({ name: "Requestor" }) })],
      };
      userRepo.findManyByIds.mockResolvedValue([secondUser as any]);

      const result = await service.findManyByIds([USER_ID, SECOND_USER_ID], TENANT_ID);

      expect(userRepo.findManyByIds).toHaveBeenCalledWith([SECOND_USER_ID], TENANT_ID);
      expect(redis.set).toHaveBeenCalledWith(
        CacheKeys.userSummary(TENANT_ID, SECOND_USER_ID),
        expect.objectContaining({ id: SECOND_USER_ID }),
        CacheTTL.MEDIUM
      );
      expect(result).toHaveLength(2);
    });

    it("returns empty array when all IDs are empty", async () => {
      const result = await service.findManyByIds([], TENANT_ID);
      expect(result).toEqual([]);
      expect(redis.get).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // countByTenant()
  // ────────────────────────────────────────────────────────────────
  describe("countByTenant()", () => {
    it("delegates to repository without caching", async () => {
      userRepo.countByTenant.mockResolvedValue(42);

      const result = await service.countByTenant(TENANT_ID);

      expect(userRepo.countByTenant).toHaveBeenCalledWith(TENANT_ID);
      expect(redis.get).not.toHaveBeenCalled();
      expect(result).toBe(42);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // existsWithRole()
  // ────────────────────────────────────────────────────────────────
  describe("existsWithRole()", () => {
    it("returns true when user exists and has the requested role", async () => {
      redis.get.mockResolvedValue(expectedSummary as any);

      const result = await service.existsWithRole(USER_ID, TENANT_ID, "Admin");

      expect(result).toBe(true);
    });

    it("returns false when user exists but does not have the role", async () => {
      redis.get.mockResolvedValue(expectedSummary as any);

      const result = await service.existsWithRole(USER_ID, TENANT_ID, "Approver");

      expect(result).toBe(false);
    });

    it("returns false when user does not exist", async () => {
      redis.get.mockResolvedValue(null);
      userRepo.findByIdWithRoles.mockResolvedValue(null);

      const result = await service.existsWithRole("nonexistent", TENANT_ID, "Admin");

      expect(result).toBe(false);
    });
  });
});

