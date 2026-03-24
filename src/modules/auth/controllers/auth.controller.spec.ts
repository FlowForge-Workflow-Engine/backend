import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "../services/auth.service";
import { OnboardingService } from "../services/onboarding.service";
import { UserService } from "../services/user.service";
import { makeUser, makeJwtPayload, TEST_IDS } from "@app/shared/test-utils";
import { UserResponseDto } from "../dto/dto-response/user-response.dto";

describe("AuthController", () => {
  let controller: AuthController;
  let authService: jest.Mocked<Pick<AuthService, "login" | "refresh" | "logout">>;
  let onboardingService: jest.Mocked<Pick<OnboardingService, "registerTenant" | "registerUser">>;
  let userService: jest.Mocked<Pick<UserService, "findById">>;

  const TOKEN_PAIR = { accessToken: "mock.jwt.token", refreshToken: TEST_IDS.REFRESH_TOKEN_ID };
  const TENANT_RESULT = {
    ...TOKEN_PAIR,
    user: { id: TEST_IDS.USER_ID, email: "alice@acme.com", firstName: "Alice", lastName: "Smith" },
    tenant: { id: TEST_IDS.TENANT_ID, name: TEST_IDS.TENANT_NAME, slug: TEST_IDS.TENANT_SLUG },
  };
  const USER_RESULT = {
    ...TOKEN_PAIR,
    user: { id: TEST_IDS.USER_ID, email: "alice@acme.com", firstName: "Alice", lastName: "Smith" },
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };

    onboardingService = {
      registerTenant: jest.fn(),
      registerUser: jest.fn(),
    };

    userService = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: OnboardingService, useValue: onboardingService },
        { provide: UserService, useValue: userService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────
  // POST /auth/register/tenant
  // ────────────────────────────────────────────────────────────────
  describe("registerTenant()", () => {
    const dto = {
      tenantName: TEST_IDS.TENANT_NAME,
      tenantSlug: TEST_IDS.TENANT_SLUG,
      email: "alice@acme.com",
      password: "Password1!",
      firstName: "Alice",
      lastName: "Smith",
    } as any;

    it("delegates to OnboardingService and wraps result in ApiResponseDto", async () => {
      onboardingService.registerTenant.mockResolvedValue(TENANT_RESULT as any);

      const result = await controller.registerTenant(dto);

      expect(onboardingService.registerTenant).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ status: "success", data: TENANT_RESULT });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /auth/register
  // ────────────────────────────────────────────────────────────────
  describe("register()", () => {
    const dto = {
      email: "bob@acme.com",
      password: "Password1!",
      firstName: "Bob",
      lastName: "Jones",
      tenantSlug: TEST_IDS.TENANT_SLUG,
    } as any;

    it("delegates to OnboardingService.registerUser and wraps result", async () => {
      onboardingService.registerUser.mockResolvedValue(USER_RESULT as any);

      const result = await controller.register(dto);

      expect(onboardingService.registerUser).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ status: "success", data: USER_RESULT });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /auth/login
  // ────────────────────────────────────────────────────────────────
  describe("login()", () => {
    const dto = { email: "alice@acme.com", password: "Password1!", tenantSlug: TEST_IDS.TENANT_SLUG } as any;

    it("delegates to AuthService.login and wraps token pair", async () => {
      authService.login.mockResolvedValue(TOKEN_PAIR as any);

      const result = await controller.login(dto);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ status: "success", data: TOKEN_PAIR });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /auth/refresh
  // ────────────────────────────────────────────────────────────────
  describe("refresh()", () => {
    it("delegates to AuthService.refresh with raw token and wraps new token pair", async () => {
      authService.refresh.mockResolvedValue(TOKEN_PAIR as any);

      const result = await controller.refresh(TEST_IDS.REFRESH_TOKEN_ID);

      expect(authService.refresh).toHaveBeenCalledWith(TEST_IDS.REFRESH_TOKEN_ID);
      expect(result).toEqual({ status: "success", data: TOKEN_PAIR });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /auth/me
  // ────────────────────────────────────────────────────────────────
  describe("getCurrentUser()", () => {
    it("fetches user by sub and tenantId from JWT payload and returns UserResponseDto", async () => {
      const jwtPayload = makeJwtPayload();
      const userEntity = makeUser() as any;
      userService.findById.mockResolvedValue(userEntity);

      const result = await controller.getCurrentUser(jwtPayload as any);

      expect(userService.findById).toHaveBeenCalledWith(jwtPayload.sub, jwtPayload.tenantId);
      expect(result.status).toBe("success");
      expect(result.data).toBeInstanceOf(UserResponseDto);
      expect(result.data.id).toBe(userEntity.id);
      expect(result.data.email).toBe(userEntity.email);
    });

    it("maps userRoles to an empty roles array when user has no roles", async () => {
      const jwtPayload = makeJwtPayload();
      const userEntity = { ...makeUser(), userRoles: [] } as any;
      userService.findById.mockResolvedValue(userEntity);

      const result = await controller.getCurrentUser(jwtPayload as any);

      expect(result.data.roles).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /auth/logout
  // ────────────────────────────────────────────────────────────────
  describe("logout()", () => {
    it("delegates to AuthService.logout with the raw refresh token and returns void", async () => {
      authService.logout.mockResolvedValue(undefined);
      const jwtPayload = makeJwtPayload();

      const result = await controller.logout(
        TEST_IDS.REFRESH_TOKEN_ID,
        jwtPayload as any,
        TEST_IDS.TENANT_ID
      );

      expect(authService.logout).toHaveBeenCalledWith(TEST_IDS.REFRESH_TOKEN_ID);
      expect(result).toBeUndefined();
    });
  });
});
