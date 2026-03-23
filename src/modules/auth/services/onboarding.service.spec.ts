import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { OnboardingService } from "./onboarding.service";
import { AuthService } from "./auth.service";
import { UserRepository } from "../repositories/user.repository";
import { RoleRepository } from "../repositories/role.repository";
import { UserRoleRepository } from "../repositories/user-role.repository";
import { AuthPublisher } from "../publishers/auth.publisher";
import { RedisService } from "../../../infra/redis.service";
import { TENANT_PROVISIONING_CONTRACT } from "@app/shared/interfaces/contracts/tenant-provisioning.contract";
import { TENANT_QUERY_CONTRACT } from "@app/shared/interfaces/contracts/tenant-query.contract";
import { NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT } from "@app/shared/interfaces/contracts/notification-template-bootstrap.contract";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { makeUser, makeRole, makeUserRole, makeTenantSummary, TEST_IDS } from "@app/shared/test-utils";
import * as argon2 from "@app/shared/utils/hashes/argon2";
import * as uuidUtil from "@app/shared/utils/uuid.util";
import { AppErrors } from "@app/shared/constants/app-errors.enum";

jest.mock("@app/shared/utils/hashes/argon2");
jest.mock("@app/shared/utils/uuid.util");

const mockArgon2hash = argon2.argon2hash as jest.MockedFunction<typeof argon2.argon2hash>;
const mockGenerateUUID = uuidUtil.generateUUID as jest.MockedFunction<typeof uuidUtil.generateUUID>;

describe("OnboardingService", () => {
  let service: OnboardingService;
  let userRepo: jest.Mocked<UserRepository>;
  let roleRepo: jest.Mocked<RoleRepository>;
  let userRoleRepo: jest.Mocked<UserRoleRepository>;
  let publisher: jest.Mocked<AuthPublisher>;
  let redis: ReturnType<typeof createMockRedisService>;
  let tenantProvisioning: { provision: jest.Mock };
  let tenantQuery: { findBySlug: jest.Mock };
  let notificationBootstrap: { ensureTenantCreatedWelcomeTemplate: jest.Mock };
  let authService: { issueTokenPair: jest.Mock };

  const TENANT_ID = TEST_IDS.TENANT_ID;
  const USER_ID = TEST_IDS.USER_ID;
  const ADMIN_ROLE = makeRole({ name: "Admin", id: TEST_IDS.ADMIN_ROLE_ID });
  const REQUESTOR_ROLE = makeRole({ name: "Requestor", id: TEST_IDS.REQUESTOR_ROLE_ID });
  const TENANT_PROVISION_RESULT = {
    id: TENANT_ID,
    name: TEST_IDS.TENANT_NAME,
    slug: TEST_IDS.TENANT_SLUG,
    plan: "free",
  };

  const tokenPairResult = { accessToken: "mock.jwt.token", refreshToken: "raw-refresh-token" };

  beforeEach(async () => {
    userRepo = {
      findByEmailAndTenant: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    roleRepo = {
      create: jest.fn(),
      saveMany: jest.fn(),
      findByNameAndTenant: jest.fn(),
    } as unknown as jest.Mocked<RoleRepository>;

    userRoleRepo = {
      assignRole: jest.fn(),
    } as unknown as jest.Mocked<UserRoleRepository>;

    publisher = {
      publishTenantCreated: jest.fn(),
      publishUserCreated: jest.fn(),
    } as unknown as jest.Mocked<AuthPublisher>;

    redis = createMockRedisService();
    tenantProvisioning = { provision: jest.fn().mockResolvedValue(TENANT_PROVISION_RESULT) };
    tenantQuery = { findBySlug: jest.fn() };
    notificationBootstrap = { ensureTenantCreatedWelcomeTemplate: jest.fn().mockResolvedValue(undefined) };
    authService = { issueTokenPair: jest.fn().mockResolvedValue(tokenPairResult) };

    mockArgon2hash.mockResolvedValue("$argon2id$hashed");
    mockGenerateUUID.mockReturnValue("event-uuid-0001");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: TENANT_PROVISIONING_CONTRACT, useValue: tenantProvisioning },
        { provide: TENANT_QUERY_CONTRACT, useValue: tenantQuery },
        { provide: NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT, useValue: notificationBootstrap },
        { provide: UserRepository, useValue: userRepo },
        { provide: RoleRepository, useValue: roleRepo },
        { provide: UserRoleRepository, useValue: userRoleRepo },
        { provide: AuthService, useValue: authService },
        { provide: AuthPublisher, useValue: publisher },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────
  // registerTenant()
  // ────────────────────────────────────────────────────────────────
  describe("registerTenant()", () => {
    const dto = {
      tenantName: TEST_IDS.TENANT_NAME,
      tenantSlug: TEST_IDS.TENANT_SLUG,
      email: "alice@acme.com",
      password: "Password1!",
      firstName: "Alice",
      lastName: "Smith",
    };

    const setupHappyPath = () => {
      redis.setNX.mockResolvedValue(true);
      userRepo.findByEmailAndTenant.mockResolvedValue(null);
      userRepo.create.mockReturnValue(makeUser() as any);
      userRepo.save.mockResolvedValue(makeUser({ id: USER_ID }) as any);
      roleRepo.create.mockImplementation((data) => data as any);
      roleRepo.saveMany.mockResolvedValue([ADMIN_ROLE, REQUESTOR_ROLE] as any);
      userRoleRepo.assignRole.mockResolvedValue(makeUserRole() as any);
    };

    it("provisions tenant, seeds roles, creates admin user, bootstraps templates, publishes events, and returns tokens", async () => {
      setupHappyPath();

      const result = await service.registerTenant(dto);

      expect(redis.setNX).toHaveBeenCalledWith(`register:tenant:${dto.tenantSlug}`, "1", 60);
      expect(tenantProvisioning.provision).toHaveBeenCalledWith(
        expect.objectContaining({ slug: dto.tenantSlug, plan: "free" })
      );
      expect(roleRepo.saveMany).toHaveBeenCalled();
      expect(userRepo.save).toHaveBeenCalled();
      expect(userRoleRepo.assignRole).toHaveBeenCalledWith(USER_ID, ADMIN_ROLE.id, TENANT_ID, USER_ID);
      expect(notificationBootstrap.ensureTenantCreatedWelcomeTemplate).toHaveBeenCalledWith(TENANT_ID);
      expect(publisher.publishTenantCreated).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID })
      );
      expect(publisher.publishUserCreated).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, roles: ["Admin"] })
      );
      expect(authService.issueTokenPair).toHaveBeenCalled();
      expect(result.accessToken).toBe("mock.jwt.token");
      expect(result.tenant?.slug).toBe(TEST_IDS.TENANT_SLUG);
      // Lock must always be released in finally block
      expect(redis.del).toHaveBeenCalledWith(`register:tenant:${dto.tenantSlug}`);
    });

    it("throws ConflictException and releases lock when registration is in progress", async () => {
      redis.setNX.mockResolvedValue(false);

      await expect(service.registerTenant(dto)).rejects.toThrow(ConflictException);
      // Lock was not acquired so del should NOT be called
      expect(redis.del).not.toHaveBeenCalled();
    });

    it("throws ConflictException and releases lock when email already exists", async () => {
      redis.setNX.mockResolvedValue(true);
      roleRepo.create.mockImplementation((data) => data as any);
      roleRepo.saveMany.mockResolvedValue([ADMIN_ROLE, REQUESTOR_ROLE] as any);
      userRepo.findByEmailAndTenant.mockResolvedValue(makeUser() as any);

      await expect(service.registerTenant(dto)).rejects.toThrow(ConflictException);
      await expect(service.registerTenant(dto)).rejects.toThrow(AppErrors.EMAIL_ALREADY_EXISTS);
      // Lock must be released even on error
      expect(redis.del).toHaveBeenCalledWith(`register:tenant:${dto.tenantSlug}`);
    });

    it("issues tokens without Admin role IDs when no admin role is seeded", async () => {
      setupHappyPath();
      // saveMany returns roles without Admin
      roleRepo.saveMany.mockResolvedValue([REQUESTOR_ROLE] as any);

      await service.registerTenant(dto);

      expect(authService.issueTokenPair).toHaveBeenCalledWith(
        expect.anything(), // userId
        expect.anything(), // email
        expect.anything(), // firstName
        expect.anything(), // tenantId
        expect.anything(), // tenantSlug
        [], // roles
        [], // roleIds
        expect.anything() // plan
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  // registerUser()
  // ────────────────────────────────────────────────────────────────
  describe("registerUser()", () => {
    const dto = {
      email: "bob@acme.com",
      password: "Password1!",
      firstName: "Bob",
      lastName: "Jones",
      tenantSlug: TEST_IDS.TENANT_SLUG,
    };

    const activeTenant = makeTenantSummary({ isActive: true });

    const setupUserHappyPath = () => {
      redis.setNX.mockResolvedValue(true);
      tenantQuery.findBySlug.mockResolvedValue(activeTenant);
      userRepo.findByEmailAndTenant.mockResolvedValue(null);
      userRepo.create.mockReturnValue(makeUser({ email: dto.email }) as any);
      userRepo.save.mockResolvedValue(makeUser({ id: USER_ID, email: dto.email }) as any);
      roleRepo.findByNameAndTenant.mockResolvedValue(REQUESTOR_ROLE as any);
      userRoleRepo.assignRole.mockResolvedValue(makeUserRole() as any);
    };

    it("creates user with Requestor role, publishes event, invalidates cache, and returns tokens", async () => {
      setupUserHappyPath();

      const result = await service.registerUser(dto);

      expect(redis.setNX).toHaveBeenCalledWith(`register:user:${dto.email}:${dto.tenantSlug}`, "1", 60);
      expect(tenantQuery.findBySlug).toHaveBeenCalledWith(dto.tenantSlug);
      expect(userRepo.save).toHaveBeenCalled();
      expect(userRoleRepo.assignRole).toHaveBeenCalledWith(USER_ID, REQUESTOR_ROLE.id, TENANT_ID, null);
      expect(publisher.publishUserCreated).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, roles: ["Requestor"] })
      );
      expect(redis.del).toHaveBeenCalledWith(expect.stringContaining(TENANT_ID));
      expect(result.accessToken).toBe("mock.jwt.token");
      expect(result.tenant).toBeUndefined();
      // Lock released in finally
      expect(redis.del).toHaveBeenCalledWith(`register:user:${dto.email}:${dto.tenantSlug}`);
    });

    it("throws ConflictException when registration is already in progress", async () => {
      redis.setNX.mockResolvedValue(false);
      await expect(service.registerUser(dto)).rejects.toThrow(ConflictException);
    });

    it("throws NotFoundException when tenant slug does not exist", async () => {
      redis.setNX.mockResolvedValue(true);
      tenantQuery.findBySlug.mockResolvedValue(null);
      await expect(service.registerUser(dto)).rejects.toThrow(NotFoundException);
      await expect(service.registerUser(dto)).rejects.toThrow(AppErrors.TENANT_NOT_FOUND);
    });

    it("throws ForbiddenException when tenant is inactive", async () => {
      redis.setNX.mockResolvedValue(true);
      tenantQuery.findBySlug.mockResolvedValue(makeTenantSummary({ isActive: false }));
      await expect(service.registerUser(dto)).rejects.toThrow(ForbiddenException);
    });

    it("throws ConflictException when email already exists in tenant", async () => {
      redis.setNX.mockResolvedValue(true);
      tenantQuery.findBySlug.mockResolvedValue(activeTenant);
      userRepo.findByEmailAndTenant.mockResolvedValue(makeUser() as any);
      await expect(service.registerUser(dto)).rejects.toThrow(ConflictException);
      await expect(service.registerUser(dto)).rejects.toThrow(AppErrors.EMAIL_ALREADY_EXISTS);
    });

    it("registers user without Requestor role when role is not seeded", async () => {
      setupUserHappyPath();
      roleRepo.findByNameAndTenant.mockResolvedValue(null);

      await service.registerUser(dto);

      expect(userRoleRepo.assignRole).not.toHaveBeenCalled();
      expect(authService.issueTokenPair).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        [],
        [],
        expect.anything()
      );
    });
  });
});
