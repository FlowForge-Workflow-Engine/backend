import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { ApiResponseDto } from "@app/shared/dto/base-response.dto";
import { DashboardStatsResponseDto } from "../dto/dashboard-stats-response.dto";
import { DashboardService } from "../services/dashboard.service";

@ApiTags("Dashboard")
@ApiBearerAuth()
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("stats")
  @ApiOperation({ summary: "Get tenant dashboard statistics" })
  @ApiSuccessResponse(DashboardStatsResponseDto, "Dashboard statistics retrieved successfully")
  async getStats(@TenantId() tenantId: string): Promise<ApiResponseDto<DashboardStatsResponseDto>> {
    // TenantId comes from the authenticated request context so callers cannot spoof another tenant's totals.
    const data = await this.dashboardService.getStats(tenantId);
    return { status: "success", data };
  }
}
