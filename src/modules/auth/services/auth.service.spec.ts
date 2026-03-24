import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { UserRepository } from "../repositories/user.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { TENANT_QUERY_CONTRACT } from "@app/shared/interfaces/contracts/tenant-query.contract";
import { RequestContextService } from "@app/database";
import {
  createMockJwtService,
  createMockConfigService,
  createMockRequestContextService,
  createMockQueryRunner,
} from "@app/shared/test-utils/mocks";
import {
  makeUser,
  makeUserRole,
  makeRefreshToken,
  makeTenantSummary,
  TEST_IDS,
} from "@app/shared/test-utils";
import * as argon2 from "@app/shared/utils/hashes/argon2";
import * as hashUtil from "@app/shared/utils/hashes/hash";
import * as uuidUtil from "@app/shared/utils/uuid.util";

jest.mock("@app/shared/utils/hashes/argon2");
jest.mock("@app/shared/utils/hashes/hash");
jest.mock("@app/shared/utils/uuid.util");

const mockArgon2verify = argon2.argon2verify as jest.MockedFunction<typeof argon2.argon2verify>;
const mockSha256 = hashUtil.sha256 as jest.MockedFunction<typeof hashUtil.sha256>;
const mockGenerateUUID = uuidUtil.generateUUID as jest.MockedFunction<typeof uuidUtil.generateUUID>;

describe("AuthService", () => {
  let service: AuthService;
  let userRepo: jest.Mocked<UserRepository>;
  let refreshTokenRepo: jest.Mocked<RefreshTokenRepository>;
  let tenantQuery: { findById: jest.Mock };
  let jwtService: ReturnType<typeof createMockJwtService>;
  let configService: ReturnType<typeof createMockConfigService>;
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  const adminRole = makeRole();
  const userWithRoles = {
    ...makeUser(),
    userRoles: [makeUserRole()],
  };
  const tenant = makeTenantSummary();
  const rawRefreshToken = "raw-refresh-uuid";
  const tokenHash = "sha256-token-hash";

  function makeRole() {
    return {
      id: TEST_IDS.ADMIN_ROLE_ID,
      tenantId: TEST_IDS.TENANT_ID,
      name: "Admin",
      description: "Full access",
      isSystemRole: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      userRoles: [],
    };
  }

  beforeEach(async () => {
    userRepo = {
      findByEmailAndTenant: jest.fn(),
      findByIdWithRoles: jest.fn(),
      findByIdAndTenantWithRoles: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    refreshTokenRepo = {
      findByHash: jest.fn(),
      create: jest.fn(),
      revoke: jest.fn(),
    } as unknown as jest.Mocked<RefreshTokenRepository>;

    tenantQuery = { findById: jest.fn().mockResolvedValue(tenant) };
    jwtService = createMockJwtService();
    configService = createMockConfigService({ JWT_REFRESH_EXPIRY_DAYS: 7 });
    requestContext = createMockRequestContextService();

    mockSha256.mockReturnValue(tokenHash);
    mockGenerateUUID.mockReturnValue(rawRefreshToken);
    mockArgon2verify.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: userRepo },
        { provide: RefreshTokenRepository, useValue: refreshTokenRepo },
        { provide: TENANT_QUERY_CONTRACT, useValue: tenantQuery },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────
  // login()
  // ────────────────────────────────────────────────────────────────
  describe("login()", () => {
    const loginDto = {
      email: "alice@acme.com",
      password: "Password1!",
      tenantId: TEST_IDS.TENANT_ID,
    };

    it("returns token pair on valid credentials", async () => {
      userRepo.findByEmailAndTenant.mockResolvedValue(makeUser() as any);
      userRepo.findByIdWithRoles.mockResolvedValue(userWithRoles as any);
      userRepo.save.mockResolvedValue(makeUser() as any);
      refreshTokenRepo.create.mockResolvedValue(makeRefreshToken() as any);

      const result = await service.login(loginDto);

      expect(result).toEqual({
        accessToken: "mock.jwt.access.token",
        refreshToken: rawRefreshToken,
      });
      expect(userRepo.save).toHaveBeenCalled();
    });

    it("throws UnauthorizedException when user not found", async () => {
      userRepo.findByEmailAndTenant.mockResolvedValue(null);
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when user is inactive", async () => {
      userRepo.findByEmailAndTenant.mockResolvedValue(makeUser({ isActive: false }) as any);
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when password is invalid", async () => {
      userRepo.findByEmailAndTenant.mockResolvedValue(makeUser() as any);
      mockArgon2verify.mockResolvedValueOnce(false);
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // refresh()
  // ────────────────────────────────────────────────────────────────
  describe("refresh()", () => {
    it("rotates token pair successfully", async () => {
      const storedToken = makeRefreshToken();
      refreshTokenRepo.findByHash.mockResolvedValue(storedToken as any);
      refreshTokenRepo.revoke.mockResolvedValue(undefined);
      userRepo.findByIdWithRoles.mockResolvedValue(userWithRoles as any);
      refreshTokenRepo.create.mockResolvedValue(makeRefreshToken() as any);

      const result = await service.refresh(rawRefreshToken);

      expect(refreshTokenRepo.revoke).toHaveBeenCalledWith(storedToken.id);
      expect(result).toEqual({
        accessToken: "mock.jwt.access.token",
        refreshToken: rawRefreshToken,
      });
    });

    it("throws UnauthorizedException when token not found", async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(null);
      await expect(service.refresh(rawRefreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when token expired", async () => {
      const expiredToken = makeRefreshToken({ expiresAt: new Date(Date.now() - 1000) });
      refreshTokenRepo.findByHash.mockResolvedValue(expiredToken as any);
      await expect(service.refresh(rawRefreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when user is inactive after token lookup", async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(makeRefreshToken() as any);
      refreshTokenRepo.revoke.mockResolvedValue(undefined);
      userRepo.findByIdWithRoles.mockResolvedValue({ ...userWithRoles, isActive: false } as any);
      await expect(service.refresh(rawRefreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it("sets app.tenant_id on active QueryRunner mid-refresh", async () => {
      const mockQR = createMockQueryRunner();
      requestContext.getQueryRunner.mockReturnValue(mockQR as any);

      refreshTokenRepo.findByHash.mockResolvedValue(makeRefreshToken() as any);
      refreshTokenRepo.revoke.mockResolvedValue(undefined);
      userRepo.findByIdWithRoles.mockResolvedValue(userWithRoles as any);
      refreshTokenRepo.create.mockResolvedValue(makeRefreshToken() as any);

      await service.refresh(rawRefreshToken);

      expect(mockQR.query).toHaveBeenCalledWith(`SELECT set_config('app.tenant_id', $1::text, true)`, [
        TEST_IDS.TENANT_ID,
      ]);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // logout()
  // ────────────────────────────────────────────────────────────────
  describe("logout()", () => {
    it("revokes the stored token", async () => {
      const storedToken = makeRefreshToken();
      refreshTokenRepo.findByHash.mockResolvedValue(storedToken as any);
      await service.logout(rawRefreshToken);
      expect(refreshTokenRepo.revoke).toHaveBeenCalledWith(storedToken.id);
    });

    it("is a no-op when token not found", async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(null);
      await service.logout(rawRefreshToken);
      expect(refreshTokenRepo.revoke).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // issueTokenPair()
  // ────────────────────────────────────────────────────────────────
  describe("issueTokenPair()", () => {
    it("signs JWT and persists hashed refresh token", async () => {
      refreshTokenRepo.create.mockResolvedValue(makeRefreshToken() as any);

      const result = await service.issueTokenPair(
        TEST_IDS.USER_ID,
        "alice@acme.com",
        "Alice",
        TEST_IDS.TENANT_ID,
        TEST_IDS.TENANT_SLUG,
        ["Admin"],
        [TEST_IDS.ADMIN_ROLE_ID],
        "free"
      );

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: TEST_IDS.USER_ID, tenantId: TEST_IDS.TENANT_ID })
      );
      expect(refreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash, userId: TEST_IDS.USER_ID })
      );
      expect(result.accessToken).toBe("mock.jwt.access.token");
      expect(result.refreshToken).toBe(rawRefreshToken);
    });
  });
});
