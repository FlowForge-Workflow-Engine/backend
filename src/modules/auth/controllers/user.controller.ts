import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { CurrentUser } from "@app/shared/decorators/current-user.decorator";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto, CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { UserService } from "../services/user.service";
import { CreateUserDto } from "../dto/create-user.dto";
import { AssignRoleDto } from "../dto/assign-role.dto";
import {
  UserListResponseDto,
  UserDetailResponseDto,
  UserCreatedResponseDto,
} from "../dto/dto-response/user-response.dto";
import { FindUserDto } from "../dto/find-user.dto";

@ApiTags("Users")
@ApiBearerAuth()
@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: "List all users within the authenticated tenant" })
  @ApiSuccessResponse(UserListResponseDto, "Users retrieved successfully", { isArray: true })
  async findAll(
    @Query() dto: FindUserDto,
    @TenantId() tenantId: string
  ): Promise<CountApiResponseDto<UserListResponseDto[]>> {
    const users = await this.userService.findAll(dto, tenantId);

    const data = users.map((user) => UserListResponseDto.fromEntity(user));

    return { status: "success", count: data.length, data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a user within the authenticated tenant" })
  @ApiSuccessResponse(UserCreatedResponseDto, "User created successfully", { created: true })
  async create(
    @Body() dto: CreateUserDto,
    @TenantId() tenantId: string,
    @CurrentUser() actor: IJwtPayload
  ): Promise<ApiResponseDto<UserCreatedResponseDto>> {
    const user = await this.userService.create(dto, tenantId, actor.sub);

    const data = UserCreatedResponseDto.fromEntity(user);

    return { status: "success", data };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a user by ID within the authenticated tenant" })
  @ApiSuccessResponse(UserDetailResponseDto, "User retrieved successfully")
  async findOne(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<UserDetailResponseDto>> {
    const user = await this.userService.findById(id, tenantId);

    const data = UserDetailResponseDto.fromEntity(user);

    return { status: "success", data };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Deactivate a user" })
  async deactivate(@Param() { id }: IdParamDto, @TenantId() tenantId: string): Promise<void> {
    await this.userService.deactivate(id, tenantId);
  }

  @Post(":id/roles")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Assign a role to a user" })
  async assignRole(
    @Param() { id }: IdParamDto,
    @Body() dto: AssignRoleDto,
    @TenantId() tenantId: string,
    @CurrentUser() actor: IJwtPayload
  ): Promise<void> {
    await this.userService.assignRole(id, dto.roleId, tenantId, actor.sub);
  }
}
