import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto, CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { TenantService } from "../services/tenant.service";
import { CreateTenantDto } from "../dto/create-tenant.dto";
import { UpdateTenantDto } from "../dto/update-tenant.dto";
import { UpdateTenantSettingsDto } from "../dto/update-tenant-settings.dto";
import { CreateFeatureFlagDto } from "../dto/create-feature-flag.dto";
import { UpdateFeatureFlagDto } from "../dto/update-feature-flag.dto";
import {
  TenantListResponseDto,
  TenantDetailResponseDto,
  TenantCreatedResponseDto,
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
  async findAll(): Promise<CountApiResponseDto<TenantListResponseDto[]>> {
    const data = await this.tenantService.findAll();
    return { status: "success", count: data.length, data };
  }

  @Post()
  @ApiOperation({ summary: "Create a new tenant" })
  @ApiSuccessResponse(TenantCreatedResponseDto, "Tenant created successfully", { created: true })
  async create(@Body() dto: CreateTenantDto): Promise<ApiResponseDto<TenantCreatedResponseDto>> {
    const data = await this.tenantService.create(dto);
    return { status: "success", data };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get tenant by ID" })
  @ApiSuccessResponse(TenantDetailResponseDto, "Tenant retrieved successfully")
  async findOne(@Param() { id }: IdParamDto): Promise<ApiResponseDto<TenantDetailResponseDto>> {
    const data = await this.tenantService.findById(id);
    return { status: "success", data };
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update tenant name, plan, or active status" })
  @ApiSuccessResponse(TenantUpdatedResponseDto, "Tenant updated successfully")
  async update(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateTenantDto
  ): Promise<ApiResponseDto<TenantUpdatedResponseDto>> {
    const data = await this.tenantService.update(id, dto);
    return { status: "success", data };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Deactivate a tenant" })
  async deactivate(@Param() { id }: IdParamDto): Promise<void> {
    await this.tenantService.deactivate(id);
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
  @ApiOperation({ summary: "Update settings for a tenant" })
  @ApiSuccessResponse(TenantSettingsResponseDto, "Tenant settings updated successfully")
  async updateSettings(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateTenantSettingsDto
  ): Promise<ApiResponseDto<TenantSettingsResponseDto>> {
    const data = await this.tenantService.updateSettings(id, dto);
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
  @ApiOperation({ summary: "Create a feature flag for a tenant" })
  @ApiSuccessResponse(TenantFeatureFlagCreatedResponseDto, "Feature flag created successfully", {
    created: true,
  })
  async createFeatureFlag(
    @Param() { id }: IdParamDto,
    @Body() dto: CreateFeatureFlagDto
  ): Promise<ApiResponseDto<TenantFeatureFlagCreatedResponseDto>> {
    const data = await this.tenantService.createFeatureFlag(id, dto);
    return { status: "success", data };
  }

  @Patch(":id/feature-flags/:key")
  @ApiOperation({ summary: "Update a feature flag" })
  @ApiParam({ name: "key", description: "Feature flag key (e.g. enable_webhooks)" })
  @ApiSuccessResponse(TenantFeatureFlagUpdatedResponseDto, "Feature flag updated successfully")
  async updateFeatureFlag(
    @Param() { id }: IdParamDto,
    @Param("key") key: string,
    @Body() dto: UpdateFeatureFlagDto
  ): Promise<ApiResponseDto<TenantFeatureFlagUpdatedResponseDto>> {
    const data = await this.tenantService.updateFeatureFlag(id, key, dto);
    return { status: "success", data };
  }

  @Delete(":id/feature-flags/:key")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a feature flag" })
  @ApiParam({ name: "key", description: "Feature flag key (e.g. enable_webhooks)" })
  async deleteFeatureFlag(@Param() { id }: IdParamDto, @Param("key") key: string): Promise<void> {
    await this.tenantService.deleteFeatureFlag(id, key);
  }
}
