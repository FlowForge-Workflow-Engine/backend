import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto, CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { CurrentUser } from "@app/shared/decorators/current-user.decorator";
import { Roles } from "@app/shared/decorators/roles.decorator";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { DefaultSystemRoles } from "@app/shared/constants/default-system-roles.enum";
import { TenantService } from "../services/tenant.service";
import { UpdateTenantDto } from "../dto/update-tenant.dto";
import { UpdateTenantSettingsDto } from "../dto/update-tenant-settings.dto";
import { CreateFeatureFlagDto } from "../dto/create-feature-flag.dto";
import { UpdateFeatureFlagDto } from "../dto/update-feature-flag.dto";
import { FindTenantDto } from "../dto/find-tenant.dto";
import {
  TenantListResponseDto,
  TenantDetailResponseDto,
  TenantUpdatedResponseDto,
} from "../dto/dto-response/tenant-response.dto";
import {
  TenantSettingsResponseDto,
  TenantFeatureFlagListResponseDto,
  TenantFeatureFlagCreatedResponseDto,
  TenantFeatureFlagUpdatedResponseDto,
} from "../dto/dto-response/tenant-settings-response.dto";

@ApiTags("Tenants")
@ApiBearerAuth()
@Controller("tenants")
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  // ── Tenant CRUD ───────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "List all tenants (super-admin)" })
  @ApiSuccessResponse(TenantListResponseDto, "Tenants retrieved successfully", { isArray: true })
  async findAll(@Query() dto: FindTenantDto): Promise<CountApiResponseDto<TenantListResponseDto[]>> {
    const data = await this.tenantService.findAll(dto);
    return { status: "success", count: data.length, data };
  }

  // @Post()
  // @ApiOperation({ summary: "Create a new tenant" })
  // @ApiSuccessResponse(TenantCreatedResponseDto, "Tenant created successfully", { created: true })
  // async create(@Body() dto: CreateTenantDto): Promise<ApiResponseDto<TenantCreatedResponseDto>> {
  //   const data = await this.tenantService.create(dto);
  //   return { status: "success", data };
  // }

  @Get(":id")
  @ApiOperation({ summary: "Get tenant by ID" })
  @ApiSuccessResponse(TenantDetailResponseDto, "Tenant retrieved successfully")
  async findOne(@Param() { id }: IdParamDto): Promise<ApiResponseDto<TenantDetailResponseDto>> {
    const data = await this.tenantService.findById(id);
    return { status: "success", data };
  }

  @Patch(":id")
  @Roles(DefaultSystemRoles.ADMIN)
  @ApiOperation({ summary: "Update tenant name, plan, or active status (Admin only)" })
  @ApiSuccessResponse(TenantUpdatedResponseDto, "Tenant updated successfully")
  async update(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: IJwtPayload
  ): Promise<ApiResponseDto<TenantUpdatedResponseDto>> {
    const data = await this.tenantService.update(id, user.tenantId, dto);
    return { status: "success", data };
  }

  @Delete(":id")
  @Roles(DefaultSystemRoles.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Deactivate a tenant (Admin only)" })
  async deactivate(@Param() { id }: IdParamDto, @CurrentUser() user: IJwtPayload): Promise<void> {
    await this.tenantService.deactivate(id, user.tenantId);
  }

  // ── Tenant Settings ───────────────────────────────────────────

  @Get(":id/settings")
  @ApiOperation({ summary: "Get settings for a tenant" })
  @ApiSuccessResponse(TenantSettingsResponseDto, "Tenant settings retrieved successfully")
  async getSettings(@Param() { id }: IdParamDto): Promise<ApiResponseDto<TenantSettingsResponseDto>> {
    const data = await this.tenantService.getSettings(id);
    return { status: "success", data };
  }

  @Patch(":id/settings")
  @Roles(DefaultSystemRoles.ADMIN)
  @ApiOperation({ summary: "Update settings for a tenant (Admin only)" })
  @ApiSuccessResponse(TenantSettingsResponseDto, "Tenant settings updated successfully")
  async updateSettings(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateTenantSettingsDto,
    @CurrentUser() user: IJwtPayload
  ): Promise<ApiResponseDto<TenantSettingsResponseDto>> {
    const data = await this.tenantService.updateSettings(id, user.tenantId, dto);
    return { status: "success", data };
  }

  // ── Feature Flags ─────────────────────────────────────────────

  @Get(":id/feature-flags")
  @ApiOperation({ summary: "List all feature flags for a tenant" })
  @ApiSuccessResponse(TenantFeatureFlagListResponseDto, "Feature flags retrieved successfully", {
    isArray: true,
  })
  async getFeatureFlags(
    @Param() { id }: IdParamDto
  ): Promise<CountApiResponseDto<TenantFeatureFlagListResponseDto[]>> {
    const data = await this.tenantService.getFeatureFlags(id);
    return { status: "success", count: data.length, data };
  }

  @Post(":id/feature-flags")
  @Roles(DefaultSystemRoles.ADMIN)
  @ApiOperation({ summary: "Create a feature flag for a tenant (Admin only)" })
  @ApiSuccessResponse(TenantFeatureFlagCreatedResponseDto, "Feature flag created successfully", {
    created: true,
  })
  async createFeatureFlag(
    @Param() { id }: IdParamDto,
    @Body() dto: CreateFeatureFlagDto,
    @CurrentUser() user: IJwtPayload
  ): Promise<ApiResponseDto<TenantFeatureFlagCreatedResponseDto>> {
    const data = await this.tenantService.createFeatureFlag(id, user.tenantId, dto);
    return { status: "success", data };
  }

  @Patch(":id/feature-flags/:key")
  @Roles(DefaultSystemRoles.ADMIN)
  @ApiOperation({ summary: "Update a feature flag (Admin only)" })
  @ApiParam({ name: "key", description: "Feature flag key (e.g. enable_webhooks)" })
  @ApiSuccessResponse(TenantFeatureFlagUpdatedResponseDto, "Feature flag updated successfully")
  async updateFeatureFlag(
    @Param() { id }: IdParamDto,
    @Param("key") key: string,
    @Body() dto: UpdateFeatureFlagDto,
    @CurrentUser() user: IJwtPayload
  ): Promise<ApiResponseDto<TenantFeatureFlagUpdatedResponseDto>> {
    const data = await this.tenantService.updateFeatureFlag(id, user.tenantId, key, dto);
    return { status: "success", data };
  }

  @Delete(":id/feature-flags/:key")
  @Roles(DefaultSystemRoles.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a feature flag (Admin only)" })
  @ApiParam({ name: "key", description: "Feature flag key (e.g. enable_webhooks)" })
  async deleteFeatureFlag(
    @Param() { id }: IdParamDto,
    @Param("key") key: string,
    @CurrentUser() user: IJwtPayload
  ): Promise<void> {
    await this.tenantService.deleteFeatureFlag(id, user.tenantId, key);
  }
}
