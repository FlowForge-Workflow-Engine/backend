import { Test, TestingModule } from "@nestjs/testing";
import { RoleController } from "./role.controller";
import { RoleService } from "../services/role.service";
import { makeRole, TEST_IDS } from "@app/shared/test-utils";
import { RoleResponseDto } from "../dto/dto-response/role-response.dto";

describe("RoleController", () => {
  let controller: RoleController;
  let roleService: jest.Mocked<Pick<RoleService, "findAll" | "createCustomRole">>;

  const TENANT_ID = TEST_IDS.TENANT_ID;

  beforeEach(async () => {
    roleService = {
      findAll: jest.fn(),
      createCustomRole: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoleController],
      providers: [{ provide: RoleService, useValue: roleService }],
    }).compile();

    controller = module.get<RoleController>(RoleController);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────
  // GET /roles
  // ────────────────────────────────────────────────────────────────
  describe("findAll()", () => {
    it("returns all roles mapped to RoleResponseDto with count", async () => {
      const roles = [
        makeRole({ name: "Admin" }),
        makeRole({ id: TEST_IDS.APPROVER_ROLE_ID, name: "Approver" }),
        makeRole({ id: TEST_IDS.REQUESTOR_ROLE_ID, name: "Requestor" }),
      ];
      roleService.findAll.mockResolvedValue(roles as any);

      const result = await controller.findAll(TENANT_ID);

      expect(roleService.findAll).toHaveBeenCalledWith(TENANT_ID);
      expect(result.status).toBe("success");
      expect(result.count).toBe(3);
      expect(result.data).toHaveLength(3);
      expect(result.data[0]).toBeInstanceOf(RoleResponseDto);
      expect(result.data[0].name).toBe("Admin");
    });

    it("returns empty list with count 0 when tenant has no roles", async () => {
      roleService.findAll.mockResolvedValue([]);

      const result = await controller.findAll(TENANT_ID);

      expect(result.count).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /roles
  // ────────────────────────────────────────────────────────────────
  describe("create()", () => {
    const dto = { name: "Reviewer", description: "Can review workflow items" } as any;

    it("creates custom role and returns RoleResponseDto wrapped in ApiResponseDto", async () => {
      const createdRole = makeRole({
        id: TEST_IDS.CUSTOM_ROLE_ID,
        name: dto.name,
        description: dto.description,
        isSystemRole: false,
      });
      roleService.createCustomRole.mockResolvedValue(createdRole as any);

      const result = await controller.create(dto, TENANT_ID);

      expect(roleService.createCustomRole).toHaveBeenCalledWith(dto, TENANT_ID);
      expect(result.status).toBe("success");
      expect(result.data).toBeInstanceOf(RoleResponseDto);
      expect(result.data.name).toBe("Reviewer");
      expect(result.data.isSystemRole).toBe(false);
    });
  });
});

