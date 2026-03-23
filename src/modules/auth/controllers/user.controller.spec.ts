import { Test, TestingModule } from "@nestjs/testing";
import { UserController } from "./user.controller";
import { UserService } from "../services/user.service";
import { makeUser, makeJwtPayload, TEST_IDS } from "@app/shared/test-utils";
import { UserResponseDto } from "../dto/dto-response/user-response.dto";

describe("UserController", () => {
  let controller: UserController;
  let userService: jest.Mocked<
    Pick<UserService, "findAll" | "findById" | "create" | "deactivate" | "assignRole">
  >;

  const TENANT_ID = TEST_IDS.TENANT_ID;
  const USER_ID = TEST_IDS.USER_ID;
  const jwtPayload = makeJwtPayload();

  beforeEach(async () => {
    userService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      deactivate: jest.fn(),
      assignRole: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: userService }],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────
  // GET /users
  // ────────────────────────────────────────────────────────────────
  describe("findAll()", () => {
    it("returns paginated list mapped to UserListResponseDto with correct count", async () => {
      const users = [makeUser(), makeUser({ id: TEST_IDS.SECOND_USER_ID, email: "bob@acme.com" })];
      userService.findAll.mockResolvedValue({ data: users as any, total: 2 });

      const dto = { page: 1, limit: 10 } as any;
      const result = await controller.findAll(dto, TENANT_ID);

      expect(userService.findAll).toHaveBeenCalledWith(dto, TENANT_ID);
      expect(result.status).toBe("success");
      expect(result.count).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toBeInstanceOf(UserResponseDto);
    });

    it("returns empty list with count 0 when no users exist", async () => {
      userService.findAll.mockResolvedValue({ data: [], total: 0 });

      const result = await controller.findAll({ page: 1, limit: 10 } as any, TENANT_ID);

      expect(result.count).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /users
  // ────────────────────────────────────────────────────────────────
  describe("create()", () => {
    const dto = {
      email: "charlie@acme.com",
      password: "Password1!",
      firstName: "Charlie",
      lastName: "Brown",
    } as any;

    it("creates a user and returns UserCreatedResponseDto", async () => {
      const createdUser = makeUser({ email: dto.email, firstName: dto.firstName }) as any;
      userService.create.mockResolvedValue(createdUser);

      const result = await controller.create(dto, TENANT_ID, jwtPayload as any);

      expect(userService.create).toHaveBeenCalledWith(dto, TENANT_ID, jwtPayload.sub);
      expect(result.status).toBe("success");
      expect(result.data).toBeInstanceOf(UserResponseDto);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /users/:id
  // ────────────────────────────────────────────────────────────────
  describe("findOne()", () => {
    it("fetches user by id and tenantId and returns UserDetailResponseDto", async () => {
      const userEntity = makeUser() as any;
      userService.findById.mockResolvedValue(userEntity);

      const result = await controller.findOne({ id: USER_ID }, TENANT_ID);

      expect(userService.findById).toHaveBeenCalledWith(USER_ID, TENANT_ID);
      expect(result.status).toBe("success");
      expect(result.data).toBeInstanceOf(UserResponseDto);
      expect(result.data.id).toBe(USER_ID);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // DELETE /users/:id
  // ────────────────────────────────────────────────────────────────
  describe("deactivate()", () => {
    it("calls UserService.deactivate and returns void", async () => {
      userService.deactivate.mockResolvedValue(undefined as any);

      const result = await controller.deactivate({ id: USER_ID }, TENANT_ID);

      expect(userService.deactivate).toHaveBeenCalledWith(USER_ID, TENANT_ID);
      expect(result).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /users/:id/roles
  // ────────────────────────────────────────────────────────────────
  describe("assignRole()", () => {
    it("delegates to UserService.assignRole with correct args and returns void", async () => {
      userService.assignRole.mockResolvedValue(undefined);

      const result = await controller.assignRole(
        { id: USER_ID },
        { roleId: TEST_IDS.ADMIN_ROLE_ID },
        TENANT_ID,
        jwtPayload as any
      );

      expect(userService.assignRole).toHaveBeenCalledWith(
        USER_ID,
        TEST_IDS.ADMIN_ROLE_ID,
        TENANT_ID,
        jwtPayload.sub
      );
      expect(result).toBeUndefined();
    });
  });
});
