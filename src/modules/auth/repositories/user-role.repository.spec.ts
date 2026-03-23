import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { UserRoleRepository } from "./user-role.repository";
import { UserRole } from "../entities/user-role.entity";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { makeUserRole, TEST_IDS } from "@app/shared/test-utils";

describe("UserRoleRepository", () => {
  let repo: UserRoleRepository;
  let entityRepo: jest.Mocked<any>;
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  const TENANT_ID = TEST_IDS.TENANT_ID;
  const USER_ID = TEST_IDS.USER_ID;
  const ROLE_ID = TEST_IDS.ADMIN_ROLE_ID;
  const ROLE_ID_2 = TEST_IDS.APPROVER_ROLE_ID;
  const ACTOR_ID = TEST_IDS.ACTOR_ID;

  beforeEach(async () => {
    entityRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data: unknown) => data),
      save: jest.fn().mockImplementation((entity: unknown) => Promise.resolve(entity)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
      target: UserRole,
    };

    requestContext = createMockRequestContextService();
    requestContext.getQueryRunner.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRoleRepository,
        { provide: getRepositoryToken(UserRole), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<UserRoleRepository>(UserRoleRepository);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────
  // createUserRole
  // ────────────────────────────────────────────────────────────────
  describe("createUserRole()", () => {
    it("creates an entity from provided data without persisting", () => {
      const data = { userId: USER_ID, roleId: ROLE_ID, tenantId: TENANT_ID, assignedBy: ACTOR_ID };
      entityRepo.create.mockReturnValue(data as any);

      const result = repo.createUserRole(data);

      expect(entityRepo.create).toHaveBeenCalledWith(data);
      expect(result).toEqual(data);
    });

    it("accepts null assignedBy for system-assigned roles", () => {
      const data = { userId: USER_ID, roleId: ROLE_ID, tenantId: TENANT_ID, assignedBy: null };
      entityRepo.create.mockReturnValue(data as any);

      const result = repo.createUserRole(data);

      expect(entityRepo.create).toHaveBeenCalledWith(data);
      expect(result).toEqual(data);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // assignRole
  // ────────────────────────────────────────────────────────────────
  describe("assignRole()", () => {
    it("creates and saves a single user-role assignment", async () => {
      const userRole = makeUserRole() as unknown as UserRole;
      entityRepo.create.mockReturnValue(userRole);
      entityRepo.save.mockResolvedValue(userRole);

      const result = await repo.assignRole(USER_ID, ROLE_ID, TENANT_ID, ACTOR_ID);

      expect(entityRepo.create).toHaveBeenCalled();
      expect(entityRepo.save).toHaveBeenCalledWith(userRole);
      expect(result).toEqual(userRole);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // assignMultipleRoles
  // ────────────────────────────────────────────────────────────────
  describe("assignMultipleRoles()", () => {
    it("creates one entity per roleId and batch-saves them", async () => {
      const roleIds = [ROLE_ID, ROLE_ID_2];
      const userRoles = roleIds.map((roleId) => makeUserRole({ roleId })) as unknown as UserRole[];
      entityRepo.create.mockImplementation((data: any) => data);
      entityRepo.save.mockResolvedValue(userRoles);

      const result = await repo.assignMultipleRoles(USER_ID, roleIds, TENANT_ID, ACTOR_ID);

      expect(entityRepo.create).toHaveBeenCalledTimes(2);
      expect(entityRepo.save).toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]));
      expect(result).toEqual(userRoles);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // findExistingAssignment
  // ────────────────────────────────────────────────────────────────
  describe("findExistingAssignment()", () => {
    it("returns existing assignment when found", async () => {
      const userRole = makeUserRole() as unknown as UserRole;
      entityRepo.findOne.mockResolvedValue(userRole);

      const result = await repo.findExistingAssignment(USER_ID, ROLE_ID);

      expect(entityRepo.findOne).toHaveBeenCalledWith({ where: { userId: USER_ID, roleId: ROLE_ID } });
      expect(result).toEqual(userRole);
    });

    it("returns null when no assignment exists", async () => {
      entityRepo.findOne.mockResolvedValue(null);
      const result = await repo.findExistingAssignment(USER_ID, ROLE_ID);
      expect(result).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // findByUserAndTenant
  // ────────────────────────────────────────────────────────────────
  describe("findByUserAndTenant()", () => {
    it("returns user-role assignments with role relation loaded", async () => {
      const userRoles = [makeUserRole()] as unknown as UserRole[];
      entityRepo.find.mockResolvedValue(userRoles);

      const result = await repo.findByUserAndTenant(USER_ID, TENANT_ID);

      expect(entityRepo.find).toHaveBeenCalledWith({
        where: { userId: USER_ID, tenantId: TENANT_ID },
        relations: ["role"],
        order: { assignedAt: "ASC" },
      });
      expect(result).toEqual(userRoles);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // findByRoleAndTenant
  // ────────────────────────────────────────────────────────────────
  describe("findByRoleAndTenant()", () => {
    it("returns assignments with user relation loaded", async () => {
      const userRoles = [makeUserRole()] as unknown as UserRole[];
      entityRepo.find.mockResolvedValue(userRoles);

      const result = await repo.findByRoleAndTenant(ROLE_ID, TENANT_ID);

      expect(entityRepo.find).toHaveBeenCalledWith({
        where: { roleId: ROLE_ID, tenantId: TENANT_ID },
        relations: ["user"],
        order: { assignedAt: "ASC" },
      });
      expect(result).toEqual(userRoles);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // removeRoleAssignment
  // ────────────────────────────────────────────────────────────────
  describe("removeRoleAssignment()", () => {
    it("deletes the assignment for the given userId and roleId", async () => {
      await repo.removeRoleAssignment(USER_ID, ROLE_ID);
      expect(entityRepo.delete).toHaveBeenCalledWith({ userId: USER_ID, roleId: ROLE_ID });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // removeAllUserRoles
  // ────────────────────────────────────────────────────────────────
  describe("removeAllUserRoles()", () => {
    it("deletes all role assignments for user within the tenant", async () => {
      await repo.removeAllUserRoles(USER_ID, TENANT_ID);
      expect(entityRepo.delete).toHaveBeenCalledWith({ userId: USER_ID, tenantId: TENANT_ID });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // countUsersByRole
  // ────────────────────────────────────────────────────────────────
  describe("countUsersByRole()", () => {
    it("returns count of users assigned to a given role in the tenant", async () => {
      entityRepo.count.mockResolvedValue(3);

      const result = await repo.countUsersByRole(ROLE_ID, TENANT_ID);

      expect(entityRepo.count).toHaveBeenCalledWith({ where: { roleId: ROLE_ID, tenantId: TENANT_ID } });
      expect(result).toBe(3);
    });

    it("returns 0 when no users have the role", async () => {
      entityRepo.count.mockResolvedValue(0);
      const result = await repo.countUsersByRole(ROLE_ID, TENANT_ID);
      expect(result).toBe(0);
    });
  });
});

