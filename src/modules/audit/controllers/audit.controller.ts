import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { AuditService } from "../services/audit.service";
import { AuditLogListResponseDto } from "../dto/dto-response/audit-response.dto";

@ApiTags("Audit Logs")
@ApiBearerAuth()
@Controller("workflow-instances")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get(":id/audit-logs")
  @ApiOperation({ summary: "Get paginated audit log for a workflow instance" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiSuccessResponse(AuditLogListResponseDto, "Audit logs retrieved successfully", { isArray: true })
  async getAuditLogs(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20
  ): Promise<CountApiResponseDto<AuditLogListResponseDto[]>> {
    const result = await this.auditService.getAuditLogs(id, tenantId, Number(page), Number(limit));
    return { status: "success", data: result.data, count: result.total };
  }
}
