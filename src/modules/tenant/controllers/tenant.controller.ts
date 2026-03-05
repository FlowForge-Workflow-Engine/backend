import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { TenantService } from "../services/tenant.service";
import { CreateTenantDto } from "../dto/create-tenant.dto";
import { UpdateTenantDto } from "../dto/update-tenant.dto";
import { UpdateTenantSettingsDto } from "../dto/update-tenant-settings.dto";
import { CreateFeatureFlagDto } from "../dto/create-feature-flag.dto";
import { UpdateFeatureFlagDto } from "../dto/update-feature-flag.dto";

@ApiTags("Tenants")
@ApiBearerAuth()
@Controller("tenants")
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  // ── Tenant CRUD ───────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "List all tenants (super-admin)" })
  findAll() {
    return this.tenantService.findAll();
  }

  @Post()
  @ApiOperation({ summary: "Create a new tenant" })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get tenant by ID" })
  findOne(@Param() { id }: IdParamDto) {
    return this.tenantService.findById(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update tenant name, plan, or active status" })
  update(@Param() { id }: IdParamDto, @Body() dto: UpdateTenantDto) {
    return this.tenantService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Deactivate a tenant" })
  deactivate(@Param() { id }: IdParamDto) {
    return this.tenantService.deactivate(id);
  }

  // ── Tenant Settings ───────────────────────────────────────────

  @Get(":id/settings")
  @ApiOperation({ summary: "Get settings for a tenant" })
  getSettings(@Param() { id }: IdParamDto) {
    return this.tenantService.getSettings(id);
  }

  @Patch(":id/settings")
  @ApiOperation({ summary: "Update settings for a tenant" })
  updateSettings(@Param() { id }: IdParamDto, @Body() dto: UpdateTenantSettingsDto) {
    return this.tenantService.updateSettings(id, dto);
  }

  // ── Feature Flags ─────────────────────────────────────────────

  @Get(":id/feature-flags")
  @ApiOperation({ summary: "List all feature flags for a tenant" })
  getFeatureFlags(@Param() { id }: IdParamDto) {
    return this.tenantService.getFeatureFlags(id);
  }

  @Post(":id/feature-flags")
  @ApiOperation({ summary: "Create a feature flag for a tenant" })
  createFeatureFlag(@Param() { id }: IdParamDto, @Body() dto: CreateFeatureFlagDto) {
    return this.tenantService.createFeatureFlag(id, dto);
  }

  @Patch(":id/feature-flags/:key")
  @ApiOperation({ summary: "Update a feature flag" })
  @ApiParam({ name: "key", description: "Feature flag key (e.g. enable_webhooks)" })
  updateFeatureFlag(
    @Param() { id }: IdParamDto,
    @Param("key") key: string,
    @Body() dto: UpdateFeatureFlagDto
  ) {
    return this.tenantService.updateFeatureFlag(id, key, dto);
  }

  @Delete(":id/feature-flags/:key")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a feature flag" })
  @ApiParam({ name: "key", description: "Feature flag key (e.g. enable_webhooks)" })
  deleteFeatureFlag(@Param() { id }: IdParamDto, @Param("key") key: string) {
    return this.tenantService.deleteFeatureFlag(id, key);
  }
}
