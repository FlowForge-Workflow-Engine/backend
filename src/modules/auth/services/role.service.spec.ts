import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException } from "@nestjs/common";
import { RoleService } from "./role.service";
import { RoleRepository } from "../repositories/role.repository";
import { makeRole, TEST_IDS } from "@app/shared/test-utils";

describe("RoleService", () => {
  let service: RoleService;
  let roleRepo: jest.Mocked<RoleRepository>;

  const TENANT_ID = TEST_IDS.TENANT_ID;

  beforeEach(async () => {
    roleRepo = {
      findByTenantId: jest.fn(),
      findByNameAndTenant: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<RoleRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [RoleService, { provide: RoleRepository, useValue: roleRepo }],
    }).compile();

    service = module.get<RoleService>(RoleService);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────
  // findAll()
  // ────────────────────────────────────────────────────────────────
  describe("findAll()", () => {
    it("returns all roles for the tenant", async () => {
      const roles = [makeRole(), makeRole({ id: TEST_IDS.APPROVER_ROLE_ID, name: "Approver" })];
      roleRepo.findByTenantId.mockResolvedValue(roles as any);

      const result = await service.findAll(TENANT_ID);

      expect(roleRepo.findByTenantId).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toHaveLength(2);
    });

    it("returns empty array when no roles exist", async () => {
      roleRepo.findByTenantId.mockResolvedValue([]);

      const result = await service.findAll(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // createCustomRole()
  // ────────────────────────────────────────────────────────────────
  describe("createCustomRole()", () => {
    const dto = { name: "Reviewer", description: "Reviews items" };

    it("creates and returns a custom role successfully", async () => {
      roleRepo.findByNameAndTenant.mockResolvedValue(null);
      roleRepo.create.mockReturnValue(makeRole({ name: "Reviewer", isSystemRole: false }) as any);
      roleRepo.save.mockResolvedValue(makeRole({ name: "Reviewer", isSystemRole: false }) as any);

      const result = await service.createCustomRole(dto, TENANT_ID);

      expect(roleRepo.findByNameAndTenant).toHaveBeenCalledWith("Reviewer", TENANT_ID);
      expect(roleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Reviewer", isSystemRole: false, tenantId: TENANT_ID })
      );
      expect(roleRepo.save).toHaveBeenCalled();
      expect(result.name).toBe("Reviewer");
    });

    it("uses null description when not provided", async () => {
      roleRepo.findByNameAndTenant.mockResolvedValue(null);
      roleRepo.create.mockReturnValue(makeRole({ name: "Reviewer", description: null }) as any);
      roleRepo.save.mockResolvedValue(makeRole({ name: "Reviewer" }) as any);

      await service.createCustomRole({ name: "Reviewer" }, TENANT_ID);

      expect(roleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: null })
      );
    });

    it("throws ConflictException when name matches a system role (case-insensitive)", async () => {
      // "admin", "Admin", "ADMIN" should all be rejected
      await expect(service.createCustomRole({ name: "Admin" }, TENANT_ID)).rejects.toThrow(
        ConflictException
      );
      await expect(service.createCustomRole({ name: "admin" }, TENANT_ID)).rejects.toThrow(
        ConflictException
      );
      await expect(service.createCustomRole({ name: "APPROVER" }, TENANT_ID)).rejects.toThrow(
        ConflictException
      );
      await expect(service.createCustomRole({ name: "requestor" }, TENANT_ID)).rejects.toThrow(
        ConflictException
      );
    });

    it("throws ConflictException when a custom role with that name already exists", async () => {
      roleRepo.findByNameAndTenant.mockResolvedValue(makeRole({ name: "Reviewer" }) as any);

      await expect(service.createCustomRole(dto, TENANT_ID)).rejects.toThrow(ConflictException);
      await expect(service.createCustomRole(dto, TENANT_ID)).rejects.toThrow(
        "Role already exists for this tenant"
      );
    });
  });
});

