import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { AuditService } from "../services/audit.service";
import { AuditLogListResponseDto } from "../dto/dto-response/audit-response.dto";
import { FindAuditLogDto } from "../dto/find-audit-log.dto";

@ApiTags("Audit Logs")
@ApiBearerAuth()
@Controller("workflow-instances")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get(":id/audit-logs")
  @ApiOperation({ summary: "Get paginated audit log for a workflow instance" })
  @ApiParam({ name: "id", description: "Workflow instance UUID", format: "uuid" })
  @ApiSuccessResponse(AuditLogListResponseDto, "Audit logs retrieved successfully", { isArray: true })
  async getAuditLogs(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
    @Query() dto: FindAuditLogDto
  ): Promise<CountApiResponseDto<AuditLogListResponseDto[]>> {
    const result = await this.auditService.getAuditLogs(id, tenantId, dto);
    return { status: "success", count: result.total, data: result.data };
  }
}
