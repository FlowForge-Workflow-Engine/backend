import { Test, TestingModule } from "@nestjs/testing";
import { RefreshTokenCleanupService } from "./refresh-token-cleanup.service";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";

describe("RefreshTokenCleanupService", () => {
  let service: RefreshTokenCleanupService;
  let refreshTokenRepository: jest.Mocked<Pick<RefreshTokenRepository, "deleteOldTokens">>;

  beforeEach(async () => {
    refreshTokenRepository = {
      deleteOldTokens: jest.fn().mockResolvedValue(0),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenCleanupService,
        { provide: RefreshTokenRepository, useValue: refreshTokenRepository },
      ],
    }).compile();

    service = module.get<RefreshTokenCleanupService>(RefreshTokenCleanupService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── onModuleInit ────────────────────────────────────────────────────────────
  describe("onModuleInit()", () => {
    it("executes without error", () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  // ─── cleanupExpiredTokens ────────────────────────────────────────────────────
  describe("cleanupExpiredTokens()", () => {
    it("calls deleteOldTokens with 36 hours and completes successfully", async () => {
      refreshTokenRepository.deleteOldTokens.mockResolvedValue(5);

      await service.cleanupExpiredTokens();

      expect(refreshTokenRepository.deleteOldTokens).toHaveBeenCalledTimes(1);
      expect(refreshTokenRepository.deleteOldTokens).toHaveBeenCalledWith(36);
    });

    it("reports zero deletions when no tokens are old enough", async () => {
      refreshTokenRepository.deleteOldTokens.mockResolvedValue(0);

      await service.cleanupExpiredTokens();

      expect(refreshTokenRepository.deleteOldTokens).toHaveBeenCalledWith(36);
    });

    it("does not throw when deleteOldTokens rejects — swallows the error", async () => {
      refreshTokenRepository.deleteOldTokens.mockRejectedValue(new Error("DB connection lost"));

      await expect(service.cleanupExpiredTokens()).resolves.toBeUndefined();
    });

    it("does not throw when deleteOldTokens rejects with a non-Error value", async () => {
      refreshTokenRepository.deleteOldTokens.mockRejectedValue("unexpected string error");

      await expect(service.cleanupExpiredTokens()).resolves.toBeUndefined();
    });
  });
});

