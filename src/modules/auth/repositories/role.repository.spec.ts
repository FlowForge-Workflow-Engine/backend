import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { RoleRepository } from "./role.repository";
import { Role } from "../entities/role.entity";
import { RequestContextService } from "@app/database";
import { createMockRequestContextService } from "@app/shared/test-utils/mocks";
import { makeRole, TEST_IDS } from "@app/shared/test-utils";

describe("RoleRepository", () => {
  let repo: RoleRepository;
  let entityRepo: jest.Mocked<any>;
  let requestContext: ReturnType<typeof createMockRequestContextService>;

  const TENANT_ID = TEST_IDS.TENANT_ID;
  const ROLE_ID = TEST_IDS.ADMIN_ROLE_ID;
  const ROLE_ID_2 = TEST_IDS.APPROVER_ROLE_ID;

  beforeEach(async () => {
    entityRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data: unknown) => data),
      save: jest.fn().mockImplementation((entity: unknown) => Promise.resolve(entity)),
      target: Role,
    };

    requestContext = createMockRequestContextService();
    requestContext.getQueryRunner.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleRepository,
        { provide: getRepositoryToken(Role), useValue: entityRepo },
        { provide: RequestContextService, useValue: requestContext },
      ],
    }).compile();

    repo = module.get<RoleRepository>(RoleRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findByTenantId()", () => {
    it("returns roles sorted by name for the tenant", async () => {
      const roles = [makeRole({ name: "Admin" }), makeRole({ id: ROLE_ID_2, name: "Viewer" })];
      entityRepo.find.mockResolvedValue(roles);

      const result = await repo.findByTenantId(TENANT_ID);

      expect(entityRepo.find).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        order: { name: "ASC" },
      });
      expect(result).toEqual(roles);
    });

    it("returns empty array when tenant has no roles", async () => {
      entityRepo.find.mockResolvedValue([]);
      const result = await repo.findByTenantId(TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  describe("findByNameAndTenant()", () => {
    it("returns role when name and tenantId match", async () => {
      const role = makeRole();
      entityRepo.findOne.mockResolvedValue(role);

      const result = await repo.findByNameAndTenant("Admin", TENANT_ID);

      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { name: "Admin", tenantId: TENANT_ID },
      });
      expect(result).toEqual(role);
    });

    it("returns null when role name not found", async () => {
      entityRepo.findOne.mockResolvedValue(null);
      const result = await repo.findByNameAndTenant("NonExistent", TENANT_ID);
      expect(result).toBeNull();
    });
  });

  describe("findByIdAndTenant()", () => {
    it("returns role when id and tenantId match", async () => {
      const role = makeRole();
      entityRepo.findOne.mockResolvedValue(role);

      const result = await repo.findByIdAndTenant(ROLE_ID, TENANT_ID);

      expect(entityRepo.findOne).toHaveBeenCalledWith({
        where: { id: ROLE_ID, tenantId: TENANT_ID },
      });
      expect(result).toEqual(role);
    });

    it("returns null when role not found", async () => {
      entityRepo.findOne.mockResolvedValue(null);
      const result = await repo.findByIdAndTenant("nonexistent", TENANT_ID);
      expect(result).toBeNull();
    });
  });

  describe("findByIds()", () => {
    it("returns empty array immediately when ids list is empty", async () => {
      const result = await repo.findByIds([], TENANT_ID);
      expect(result).toEqual([]);
      expect(entityRepo.find).not.toHaveBeenCalled();
    });

    it("queries roles by In() clause when ids provided", async () => {
      const roles = [makeRole()];
      entityRepo.find.mockResolvedValue(roles);

      const result = await repo.findByIds([ROLE_ID], TENANT_ID);

      expect(entityRepo.find).toHaveBeenCalled();
      expect(result).toEqual(roles);
    });
  });

  describe("findByNames()", () => {
    it("returns empty array immediately when names list is empty", async () => {
      const result = await repo.findByNames([], TENANT_ID);
      expect(result).toEqual([]);
      expect(entityRepo.find).not.toHaveBeenCalled();
    });

    it("queries roles by In() clause when names provided", async () => {
      const roles = [makeRole()];
      entityRepo.find.mockResolvedValue(roles);

      const result = await repo.findByNames(["Admin"], TENANT_ID);

      expect(entityRepo.find).toHaveBeenCalled();
      expect(result).toEqual(roles);
    });
  });

  describe("create()", () => {
    it("delegates to entityRepo.create()", () => {
      const data = { name: "Custom", tenantId: TENANT_ID, isSystemRole: false };
      entityRepo.create.mockReturnValue(data as any);

      const result = repo.create(data);

      expect(entityRepo.create).toHaveBeenCalledWith(data);
      expect(result).toEqual(data);
    });
  });

  describe("save()", () => {
    it("persists and returns the role", async () => {
      const role = makeRole() as unknown as Role;
      entityRepo.save.mockResolvedValue(role);

      const result = await repo.save(role);

      expect(entityRepo.save).toHaveBeenCalledWith(role);
      expect(result).toEqual(role);
    });
  });

  describe("saveMany()", () => {
    it("persists an array of roles and returns them", async () => {
      const roles = [makeRole(), makeRole({ id: ROLE_ID_2, name: "Viewer" })] as unknown as Role[];
      entityRepo.save.mockResolvedValue(roles);

      const result = await repo.saveMany(roles);

      expect(entityRepo.save).toHaveBeenCalledWith(roles);
      expect(result).toEqual(roles);
    });
  });
});

