import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { UserService } from "./user.service";
import { UserRepository } from "../repositories/user.repository";
import { RoleRepository } from "../repositories/role.repository";
import { UserRoleRepository } from "../repositories/user-role.repository";
import { AuthPublisher } from "../publishers/auth.publisher";
import { RedisService } from "../../../infra/redis.service";
import { createMockRedisService } from "@app/shared/test-utils/mocks";
import { makeUser, makeRole, makeUserRole, TEST_IDS } from "@app/shared/test-utils";
import * as argon2 from "@app/shared/utils/hashes/argon2";
import * as uuidUtil from "@app/shared/utils/uuid.util";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { CacheKeys } from "../../../infra/cache-keys";

jest.mock("@app/shared/utils/hashes/argon2");
jest.mock("@app/shared/utils/uuid.util");

const mockArgon2hash = argon2.argon2hash as jest.MockedFunction<typeof argon2.argon2hash>;
const mockGenerateUUID = uuidUtil.generateUUID as jest.MockedFunction<typeof uuidUtil.generateUUID>;

describe("UserService", () => {
  let service: UserService;
  let userRepo: jest.Mocked<UserRepository>;
  let roleRepo: jest.Mocked<RoleRepository>;
  let userRoleRepo: jest.Mocked<UserRoleRepository>;
  let publisher: jest.Mocked<AuthPublisher>;
  let redis: ReturnType<typeof createMockRedisService>;

  const TENANT_ID = TEST_IDS.TENANT_ID;
  const ACTOR_ID = TEST_IDS.ACTOR_ID;
  const USER_ID = TEST_IDS.USER_ID;
  const ROLE_ID = TEST_IDS.ADMIN_ROLE_ID;

  beforeEach(async () => {
    userRepo = {
      findByEmailAndTenant: jest.fn(),
      findByIdAndTenantWithRoles: jest.fn(),
      findByTenantIdWithRoles: jest.fn(),
      findByIdWithRoles: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    roleRepo = {
      findByNames: jest.fn(),
      findByIdAndTenant: jest.fn(),
    } as unknown as jest.Mocked<RoleRepository>;

    userRoleRepo = {
      assignRole: jest.fn(),
      assignMultipleRoles: jest.fn(),
      findExistingAssignment: jest.fn(),
    } as unknown as jest.Mocked<UserRoleRepository>;

    publisher = {
      publishUserCreated: jest.fn(),
      publishUserDeactivated: jest.fn(),
      publishUserRolesUpdated: jest.fn(),
    } as unknown as jest.Mocked<AuthPublisher>;

    redis = createMockRedisService();

    mockArgon2hash.mockResolvedValue("$argon2id$hashed");
    mockGenerateUUID.mockReturnValue("event-uuid-1234");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: userRepo },
        { provide: RoleRepository, useValue: roleRepo },
        { provide: UserRoleRepository, useValue: userRoleRepo },
        { provide: AuthPublisher, useValue: publisher },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────
  // create()
  // ────────────────────────────────────────────────────────────────
  describe("create()", () => {
    const dto = {
      email: "bob@acme.com",
      password: "Password1!",
      firstName: "Bob",
      lastName: "Jones",
      roleNames: ["Admin"],
    };

    it("creates a user, assigns roles, publishes event, and invalidates cache", async () => {
      userRepo.findByEmailAndTenant.mockResolvedValue(null);
      userRepo.create.mockReturnValue(makeUser({ email: "bob@acme.com" }) as any);
      userRepo.save.mockResolvedValue(makeUser({ id: USER_ID, email: "bob@acme.com" }) as any);
      roleRepo.findByNames.mockResolvedValue([makeRole()] as any);
      userRoleRepo.assignMultipleRoles.mockResolvedValue([makeUserRole()] as any);
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue({
        ...makeUser(),
        userRoles: [makeUserRole()],
      } as any);

      const result = await service.create(dto, TENANT_ID, ACTOR_ID);

      expect(mockArgon2hash).toHaveBeenCalledWith(dto.password);
      expect(userRepo.save).toHaveBeenCalled();
      expect(userRoleRepo.assignMultipleRoles).toHaveBeenCalledWith(USER_ID, [ROLE_ID], TENANT_ID, ACTOR_ID);
      expect(publisher.publishUserCreated).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, email: "bob@acme.com" })
      );
      expect(redis.del).toHaveBeenCalledWith(CacheKeys.usersByTenant(TENANT_ID));
      expect(result).toBeDefined();
    });

    it("creates user without roles when roleNames is empty", async () => {
      userRepo.findByEmailAndTenant.mockResolvedValue(null);
      userRepo.create.mockReturnValue(makeUser() as any);
      userRepo.save.mockResolvedValue(makeUser() as any);
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue(makeUser() as any);

      await service.create({ ...dto, roleNames: [] }, TENANT_ID, ACTOR_ID);

      expect(roleRepo.findByNames).not.toHaveBeenCalled();
      expect(userRoleRepo.assignMultipleRoles).not.toHaveBeenCalled();
    });

    it("throws ConflictException when email is already taken", async () => {
      userRepo.findByEmailAndTenant.mockResolvedValue(makeUser() as any);
      await expect(service.create(dto, TENANT_ID, ACTOR_ID)).rejects.toThrow(ConflictException);
      await expect(service.create(dto, TENANT_ID, ACTOR_ID)).rejects.toThrow(AppErrors.EMAIL_ALREADY_EXISTS);
    });

    it("skips role assignment when found roles are empty", async () => {
      userRepo.findByEmailAndTenant.mockResolvedValue(null);
      userRepo.create.mockReturnValue(makeUser() as any);
      userRepo.save.mockResolvedValue(makeUser() as any);
      roleRepo.findByNames.mockResolvedValue([]);
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue(makeUser() as any);

      await service.create(dto, TENANT_ID, ACTOR_ID);

      expect(userRoleRepo.assignMultipleRoles).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // findAll()
  // ────────────────────────────────────────────────────────────────
  describe("findAll()", () => {
    it("returns paginated users from repository", async () => {
      const users = [makeUser(), makeUser({ id: TEST_IDS.SECOND_USER_ID })];
      userRepo.findByTenantIdWithRoles.mockResolvedValue([users as any, 2]);

      const result = await service.findAll({ page: 1, limit: 10 } as any, TENANT_ID);

      expect(userRepo.findByTenantIdWithRoles).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        limit: 10,
      });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("returns empty list when no users exist", async () => {
      userRepo.findByTenantIdWithRoles.mockResolvedValue([[], 0]);

      const result = await service.findAll({ page: 1, limit: 10 } as any, TENANT_ID);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // findById()
  // ────────────────────────────────────────────────────────────────
  describe("findById()", () => {
    it("returns a user when found", async () => {
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue(makeUser() as any);

      const result = await service.findById(USER_ID, TENANT_ID);

      expect(result).toBeDefined();
      expect(result.id).toBe(USER_ID);
    });

    it("throws NotFoundException when user does not exist", async () => {
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue(null);

      await expect(service.findById("nonexistent-id", TENANT_ID)).rejects.toThrow(NotFoundException);
      await expect(service.findById("nonexistent-id", TENANT_ID)).rejects.toThrow(AppErrors.USER_NOT_FOUND);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // deactivate()
  // ────────────────────────────────────────────────────────────────
  describe("deactivate()", () => {
    it("sets isActive=false, saves, invalidates caches, and publishes event", async () => {
      const user = makeUser({ isActive: true });
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue(user as any);
      userRepo.save.mockResolvedValue({ ...user, isActive: false } as any);

      const result = await service.deactivate(USER_ID, TENANT_ID);

      expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.userSummary(TENANT_ID, USER_ID),
        CacheKeys.userRoles(TENANT_ID, USER_ID),
        CacheKeys.jwtUser(TENANT_ID, USER_ID),
        CacheKeys.usersByTenant(TENANT_ID)
      );
      expect(publisher.publishUserDeactivated).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID })
      );
      expect(result.isActive).toBe(false);
    });

    it("throws NotFoundException when user does not exist", async () => {
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue(null);

      await expect(service.deactivate("missing-id", TENANT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // assignRole()
  // ────────────────────────────────────────────────────────────────
  describe("assignRole()", () => {
    it("assigns role, invalidates caches, and publishes USER_ROLES_UPDATED event", async () => {
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue(makeUser() as any);
      roleRepo.findByIdAndTenant.mockResolvedValue(makeRole() as any);
      userRoleRepo.findExistingAssignment.mockResolvedValue(null);
      userRoleRepo.assignRole.mockResolvedValue(makeUserRole() as any);
      userRepo.findByIdWithRoles.mockResolvedValue({ ...makeUser(), userRoles: [makeUserRole()] } as any);

      await service.assignRole(USER_ID, ROLE_ID, TENANT_ID, ACTOR_ID);

      expect(userRoleRepo.assignRole).toHaveBeenCalledWith(USER_ID, ROLE_ID, TENANT_ID, ACTOR_ID);
      expect(redis.del).toHaveBeenCalledWith(
        CacheKeys.userSummary(TENANT_ID, USER_ID),
        CacheKeys.userRoles(TENANT_ID, USER_ID),
        CacheKeys.jwtUser(TENANT_ID, USER_ID)
      );
      expect(publisher.publishUserRolesUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID })
      );
    });

    it("throws NotFoundException when the user does not exist", async () => {
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue(null);

      await expect(service.assignRole("bad-id", ROLE_ID, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        NotFoundException
      );
    });

    it("throws NotFoundException when the role does not exist", async () => {
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue(makeUser() as any);
      roleRepo.findByIdAndTenant.mockResolvedValue(null);

      await expect(service.assignRole(USER_ID, "bad-role", TENANT_ID, ACTOR_ID)).rejects.toThrow(
        NotFoundException
      );
    });

    it("throws ConflictException when role is already assigned", async () => {
      userRepo.findByIdAndTenantWithRoles.mockResolvedValue(makeUser() as any);
      roleRepo.findByIdAndTenant.mockResolvedValue(makeRole() as any);
      userRoleRepo.findExistingAssignment.mockResolvedValue(makeUserRole() as any);

      await expect(service.assignRole(USER_ID, ROLE_ID, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        ConflictException
      );
    });
  });
});
