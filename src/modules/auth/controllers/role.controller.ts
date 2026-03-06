import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DefaultSystemRoles } from "@app/shared/constants/default-system-roles.enum";
import { Roles } from "@app/shared/decorators/roles.decorator";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto, CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { CreateRoleDto } from "../dto/create-role.dto";
import { RoleResponseDto } from "../dto/dto-response/role-response.dto";
import { RoleService } from "../services/role.service";

@ApiTags("Roles")
@ApiBearerAuth()
@Controller("roles")
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @ApiOperation({ summary: "List all roles within the authenticated tenant" })
  @ApiSuccessResponse(RoleResponseDto, "Roles retrieved successfully", { isArray: true })
  async findAll(@TenantId() tenantId: string): Promise<CountApiResponseDto<RoleResponseDto[]>> {
    const roles = await this.roleService.findAll(tenantId);
    const data = roles.map((role) => RoleResponseDto.fromEntity(role));

    return { status: "success", count: data.length, data };
  }

  @Post()
  @Roles(DefaultSystemRoles.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a custom role within the authenticated tenant (Admin only)" })
  @ApiSuccessResponse(RoleResponseDto, "Custom role created successfully", { created: true })
  async create(
    @Body() dto: CreateRoleDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<RoleResponseDto>> {
    const role = await this.roleService.createCustomRole(dto, tenantId);
    const data = RoleResponseDto.fromEntity(role);

    return { status: "success", data };
  }
}