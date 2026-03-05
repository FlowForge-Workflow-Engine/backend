import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto, CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { WorkflowStateService } from "../services/workflow-state.service";
import { CreateWorkflowStateDto } from "../dto/create-workflow-state.dto";
import { FindWorkflowStateDto } from "../dto/find-workflow-state.dto";
import {
  WorkflowStateListResponseDto,
  WorkflowStateDetailResponseDto,
  WorkflowStateCreatedResponseDto,
} from "../dto/dto-response/workflow-state-response.dto";

/**
 * Nested resource under workflow definitions.
 * Routes: /workflow-definitions/:id/states
 */
@ApiTags("Workflow States")
@ApiBearerAuth()
@Controller("workflow-definitions/:id/states")
export class WorkflowStateController {
  constructor(private readonly service: WorkflowStateService) {}

  @Get()
  @ApiOperation({ summary: "List all states for a workflow definition" })
  @ApiSuccessResponse(WorkflowStateListResponseDto, "Workflow states retrieved successfully", {
    isArray: true,
  })
  async findAll(
    @Body() dto: FindWorkflowStateDto,
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string
  ): Promise<CountApiResponseDto<WorkflowStateListResponseDto[]>> {
    const data = await this.service.findAll(dto, id, tenantId);
    return { status: "success", count: data.length, data };
  }

  @Post()
  @ApiOperation({ summary: "Add a state to a draft workflow definition" })
  @ApiSuccessResponse(WorkflowStateCreatedResponseDto, "Workflow state created successfully", {
    created: true,
  })
  async create(
    @Param() { id }: IdParamDto,
    @Body() dto: CreateWorkflowStateDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowStateCreatedResponseDto>> {
    const data = await this.service.create(id, dto, tenantId);
    return { status: "success", data };
  }

  @Get(":stateId")
  @ApiOperation({ summary: "Get a specific state by ID" })
  @ApiSuccessResponse(WorkflowStateDetailResponseDto, "Workflow state retrieved successfully")
  async findOne(
    @Param("stateId") stateId: string,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowStateDetailResponseDto>> {
    const data = await this.service.findById(stateId, tenantId);
    return { status: "success", data };
  }

  @Delete(":stateId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a state from a draft workflow definition" })
  async remove(@Param("stateId") stateId: string, @TenantId() tenantId: string): Promise<void> {
    await this.service.remove(stateId, tenantId);
  }
}
