import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { UserRepository } from "./user.repository";
import { User } from "../entities/user.entity";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService, createMockQueryRunner } from "@app/shared/test-utils/mocks";
import { makeUser, TEST_IDS } from "@app/shared/test-utils";
import { DBVariables } from "@app/database/constants/db-variables.enum";
import { DBRoles } from "@app/database/constants/db-roles.enum";

describe("UserRepository", () => {
  let repo: UserRepository;
  let entityRepo: jest.Mocked<any>;
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  // Canonical query builder chain mock
  const mockQB = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  const TENANT_ID = TEST_IDS.TENANT_ID;
  const USER_ID = TEST_IDS.USER_ID;

  beforeEach(async () => {
    entityRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((data: unknown) => data),
      save: jest.fn().mockImplementation((entity: unknown) => Promise.resolve(entity)),
      createQueryBuilder: jest.fn().mockReturnValue(mockQB),
      target: User,
      manager: {
        connection: {
          createQueryRunner: jest.fn(),
        },
      },
    };

    requestContext = createMockRequestContextService();
    // No QR in CLS → falls back to entityRepo
    requestContext.getQueryRunner.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        { provide: getRepositoryToken(User), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<UserRepository>(UserRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset query builder chain mocks after each test
    Object.values(mockQB).forEach((fn) => typeof fn === "function" && (fn as jest.Mock).mockClear());
    mockQB.leftJoinAndSelect.mockReturnThis();
    mockQB.where.mockReturnThis();
    mockQB.orderBy.mockReturnThis();
    mockQB.skip.mockReturnThis();
    mockQB.take.mockReturnThis();
    mockQB.getOne.mockResolvedValue(null);
    mockQB.getManyAndCount.mockResolvedValue([[], 0]);
  });

  describe("findByEmailAndTenant()", () => {
    it("queries by email and tenantId and returns user when found", async () => {
      const user = makeUser();
      entityRepo.findOne.mockResolvedValue(user);

      const result = await repo.findByEmailAndTenant("alice@acme.com", TENANT_ID);

      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { email: "alice@acme.com", tenantId: TENANT_ID },
      });
      expect(result).toEqual(user);
    });

    it("returns null when email is not found", async () => {
      entityRepo.findOne.mockResolvedValue(null);
      const result = await repo.findByEmailAndTenant("nobody@acme.com", TENANT_ID);
      expect(result).toBeNull();
    });
  });

  describe("findByIdAndTenant()", () => {
    it("returns user when id and tenantId match", async () => {
      const user = makeUser();
      entityRepo.findOne.mockResolvedValue(user);

      const result = await repo.findByIdAndTenant(USER_ID, TENANT_ID);

      expect(entityRepo.findOne).toHaveBeenCalledWith({ where: { id: USER_ID, tenantId: TENANT_ID } });
      expect(result).toEqual(user);
    });
  });

  describe("findByIdAndTenantWithRoles()", () => {
    it("uses QueryBuilder with left joins to load roles", async () => {
      const user = { ...makeUser(), userRoles: [] };
      mockQB.getOne.mockResolvedValue(user);

      const result = await repo.findByIdAndTenantWithRoles(USER_ID, TENANT_ID);

      expect(entityRepo.createQueryBuilder).toHaveBeenCalledWith("u");
      expect(mockQB.leftJoinAndSelect).toHaveBeenCalledWith("u.userRoles", "ur");
      expect(mockQB.leftJoinAndSelect).toHaveBeenCalledWith("ur.role", "r");
      expect(mockQB.where).toHaveBeenCalledWith("u.id = :id AND u.tenantId = :tenantId", {
        id: USER_ID,
        tenantId: TENANT_ID,
      });
      expect(result).toEqual(user);
    });

    it("returns null when user not found", async () => {
      mockQB.getOne.mockResolvedValue(null);
      const result = await repo.findByIdAndTenantWithRoles("nonexistent", TENANT_ID);
      expect(result).toBeNull();
    });
  });

  describe("countByTenant()", () => {
    it("delegates count to entityRepo", async () => {
      entityRepo.count.mockResolvedValue(7);
      const result = await repo.countByTenant(TENANT_ID);
      expect(entityRepo.count).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID } });
      expect(result).toBe(7);
    });
  });

  describe("findManyByIds()", () => {
    it("returns empty array immediately when ids list is empty", async () => {
      const result = await repo.findManyByIds([], TENANT_ID);
      expect(result).toEqual([]);
      expect(entityRepo.find).not.toHaveBeenCalled();
    });

    it("queries by In() clause when ids are provided", async () => {
      const users = [makeUser()];
      entityRepo.find.mockResolvedValue(users);

      const result = await repo.findManyByIds([USER_ID], TENANT_ID);

      expect(entityRepo.find).toHaveBeenCalled();
      expect(result).toEqual(users);
    });
  });

  describe("findByTenantIdWithRoles()", () => {
    it("returns paginated users with count using QueryBuilder", async () => {
      const users = [makeUser()];
      mockQB.getManyAndCount.mockResolvedValue([users, 1]);

      const result = await repo.findByTenantIdWithRoles(TENANT_ID, { page: 1, limit: 10 });

      expect(entityRepo.createQueryBuilder).toHaveBeenCalledWith("u");
      expect(mockQB.leftJoinAndSelect).toHaveBeenCalledWith("u.userRoles", "ur");
      expect(result).toEqual([users, 1]);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // RLS-aware JwtStrategy method
  // ────────────────────────────────────────────────────────────────
  describe("findByIdAndTenantWithRolesForJwtStretegy()", () => {
    it("sets RLS context via set_config, queries user, commits and releases QR", async () => {
      const user = makeUser();
      const mockQR = createMockQueryRunner();

      // Mock the QR's manager to have a getRepository that returns a findOne stub
      const mockFindOne = jest.fn().mockResolvedValue(user);
      mockQR.manager.getRepository = jest.fn().mockReturnValue({ findOne: mockFindOne });

      entityRepo.manager.connection.createQueryRunner.mockReturnValue(mockQR);

      const result = await repo.findByIdAndTenantWithRolesForJwtStretegy(USER_ID, TENANT_ID);

      // Must connect and start a transaction
      expect(mockQR.connect).toHaveBeenCalled();
      expect(mockQR.startTransaction).toHaveBeenCalled();

      // Must set RLS role and tenant_id
      expect(mockQR.query).toHaveBeenCalledWith(`SELECT set_config($1, $2, true)`, [
        DBVariables.APP_ROLE,
        DBRoles.TENANT_USER,
      ]);
      expect(mockQR.query).toHaveBeenCalledWith(`SELECT set_config('app.tenant_id', $1::text, true)`, [
        TENANT_ID,
      ]);

      // Must commit and release in finally
      expect(mockQR.commitTransaction).toHaveBeenCalled();
      expect(mockQR.release).toHaveBeenCalled();
      expect(result).toEqual(user);
    });

    it("rolls back and releases QR when query throws", async () => {
      const mockQR = createMockQueryRunner({
        isTransactionActive: false, // after rollback, isTransactionActive is false
      });
      mockQR.query.mockRejectedValueOnce(new Error("DB error"));
      entityRepo.manager.connection.createQueryRunner.mockReturnValue(mockQR);

      await expect(repo.findByIdAndTenantWithRolesForJwtStretegy(USER_ID, TENANT_ID)).rejects.toThrow(
        "DB error"
      );

      expect(mockQR.rollbackTransaction).toHaveBeenCalled();
      expect(mockQR.release).toHaveBeenCalled();
    });
  });
});
