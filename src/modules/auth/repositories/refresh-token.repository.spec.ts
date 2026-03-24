import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { RefreshTokenRepository } from "./refresh-token.repository";
import { RefreshToken } from "../entities/refresh-token.entity";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService, createMockQueryRunner } from "@app/shared/test-utils/mocks";
import { makeRefreshToken, TEST_IDS } from "@app/shared/test-utils";
import { DBVariables } from "@app/database/constants/db-variables.enum";
import { DBRoles } from "@app/database/constants/db-roles.enum";

describe("RefreshTokenRepository", () => {
  let repo: RefreshTokenRepository;
  let entityRepo: jest.Mocked<any>;
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  const TENANT_ID = TEST_IDS.TENANT_ID;
  const USER_ID = TEST_IDS.USER_ID;

  beforeEach(async () => {
    entityRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data: unknown) => data),
      save: jest.fn().mockImplementation((entity: unknown) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      target: RefreshToken,
      manager: {
        connection: {
          createQueryRunner: jest.fn(),
        },
      },
    };

    requestContext = createMockRequestContextService();
    requestContext.getQueryRunner.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenRepository,
        { provide: getRepositoryToken(RefreshToken), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<RefreshTokenRepository>(RefreshTokenRepository);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────
  // Standard CRUD
  // ────────────────────────────────────────────────────────────────
  describe("findByHash()", () => {
    it("returns token when hash matches and revokedAt is null", async () => {
      const token = makeRefreshToken();
      entityRepo.findOne.mockResolvedValue(token);

      const result = await repo.findByHash(token.tokenHash);

      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { tokenHash: token.tokenHash, revokedAt: expect.anything() },
      });
      expect(result).toEqual(token);
    });

    it("returns null when no token found", async () => {
      entityRepo.findOne.mockResolvedValue(null);
      const result = await repo.findByHash("nonexistent-hash");
      expect(result).toBeNull();
    });
  });

  describe("create()", () => {
    it("creates and saves a new refresh token", async () => {
      const data = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        tokenHash: "abc123",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      const token = makeRefreshToken({ ...data });
      entityRepo.create.mockReturnValue(token);
      entityRepo.save.mockResolvedValue(token);

      const result = await repo.create(data);

      expect(entityRepo.create).toHaveBeenCalledWith({ ...data, revokedAt: null });
      expect(entityRepo.save).toHaveBeenCalledWith(token);
      expect(result).toEqual(token);
    });
  });

  describe("revoke()", () => {
    it("updates revokedAt for the given id", async () => {
      const TOKEN_ID = TEST_IDS.REFRESH_TOKEN_ID;

      await repo.revoke(TOKEN_ID);

      expect(entityRepo.update).toHaveBeenCalledWith(
        TOKEN_ID,
        expect.objectContaining({ revokedAt: expect.any(Date) })
      );
    });
  });

  describe("revokeAllForUser()", () => {
    it("marks all active tokens for user+tenant as revoked", async () => {
      await repo.revokeAllForUser(USER_ID, TENANT_ID);

      expect(entityRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, tenantId: TENANT_ID }),
        expect.objectContaining({ revokedAt: expect.any(Date) })
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  // RLS bypass — deleteOldTokens (SUPERADMIN context)
  // ────────────────────────────────────────────────────────────────
  describe("deleteOldTokens()", () => {
    it("sets SUPERADMIN RLS context, deletes old tokens, commits and releases QR", async () => {
      const mockQR = createMockQueryRunner();
      mockQR.manager.delete = jest.fn().mockResolvedValue({ affected: 5 });
      entityRepo.manager.connection.createQueryRunner.mockReturnValue(mockQR);

      const result = await repo.deleteOldTokens(36);

      // Must connect and start a transaction
      expect(mockQR.connect).toHaveBeenCalled();
      expect(mockQR.startTransaction).toHaveBeenCalled();

      // Must set SUPERADMIN RLS role (no tenant_id needed for cleanup job)
      expect(mockQR.query).toHaveBeenCalledWith(`SELECT set_config($1, $2, true)`, [
        DBVariables.APP_ROLE,
        DBRoles.SUPERADMIN,
      ]);

      // Must delete using LessThan cutoff
      expect(mockQR.manager.delete).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({ createdAt: expect.anything() })
      );

      // Must commit and release
      expect(mockQR.commitTransaction).toHaveBeenCalled();
      expect(mockQR.release).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it("returns 0 when affected is undefined", async () => {
      const mockQR = createMockQueryRunner();
      mockQR.manager.delete = jest.fn().mockResolvedValue({ affected: undefined });
      entityRepo.manager.connection.createQueryRunner.mockReturnValue(mockQR);

      const result = await repo.deleteOldTokens(36);

      expect(result).toBe(0);
    });

    it("rolls back and releases QR when deletion throws", async () => {
      const mockQR = createMockQueryRunner({ isTransactionActive: false });
      mockQR.query.mockRejectedValueOnce(new Error("DB failure"));
      entityRepo.manager.connection.createQueryRunner.mockReturnValue(mockQR);

      await expect(repo.deleteOldTokens(36)).rejects.toThrow("DB failure");

      expect(mockQR.rollbackTransaction).toHaveBeenCalled();
      expect(mockQR.release).toHaveBeenCalled();
    });
  });
});

