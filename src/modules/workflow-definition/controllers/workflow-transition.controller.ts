import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto, CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { WorkflowTransitionService } from "../services/workflow-transition.service";
import { CreateWorkflowTransitionDto } from "../dto/create-workflow-transition.dto";
import { CreateTransitionRuleDto } from "../dto/create-transition-rule.dto";
import {
  WorkflowTransitionListResponseDto,
  WorkflowTransitionDetailResponseDto,
  WorkflowTransitionCreatedResponseDto,
  WorkflowTransitionRuleListResponseDto,
  WorkflowTransitionRuleCreatedResponseDto,
} from "../dto/dto-response/workflow-transition-response.dto";

/**
 * Nested resource under workflow definitions.
 * Routes: /workflow-definitions/:id/transitions
 */
@ApiTags("Workflow Transitions")
@ApiBearerAuth()
@Controller("workflow-definitions/:id/transitions")
export class WorkflowTransitionController {
  constructor(private readonly service: WorkflowTransitionService) {}

  @Get()
  @ApiOperation({ summary: "List all transitions for a workflow definition" })
  @ApiSuccessResponse(WorkflowTransitionListResponseDto, "Workflow transitions retrieved successfully", {
    isArray: true,
  })
  async findAll(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string
  ): Promise<CountApiResponseDto<WorkflowTransitionListResponseDto[]>> {
    const data = await this.service.findAll(id, tenantId);
    return { status: "success", count: data.length, data };
  }

  @Post()
  @ApiOperation({ summary: "Add a transition to a draft workflow definition" })
  @ApiSuccessResponse(WorkflowTransitionCreatedResponseDto, "Workflow transition created successfully", {
    created: true,
  })
  async create(
    @Param() { id }: IdParamDto,
    @Body() dto: CreateWorkflowTransitionDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowTransitionCreatedResponseDto>> {
    const data = await this.service.create(id, dto, tenantId);
    return { status: "success", data };
  }

  @Get(":transitionId")
  @ApiOperation({ summary: "Get a specific transition by ID" })
  @ApiSuccessResponse(WorkflowTransitionDetailResponseDto, "Workflow transition retrieved successfully")
  async findOne(
    @Param("transitionId") transitionId: string,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowTransitionDetailResponseDto>> {
    const data = await this.service.findById(transitionId, tenantId);
    return { status: "success", data };
  }

  @Delete(":transitionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a transition and its rules" })
  async remove(@Param("transitionId") transitionId: string, @TenantId() tenantId: string): Promise<void> {
    await this.service.remove(transitionId, tenantId);
  }

  @Post(":transitionId/rules")
  @ApiOperation({ summary: "Attach a rule to a workflow transition" })
  @ApiSuccessResponse(
    WorkflowTransitionRuleCreatedResponseDto,
    "Workflow transition rule created successfully",
    { created: true }
  )
  async addRule(
    @Param("transitionId") transitionId: string,
    @Body() dto: CreateTransitionRuleDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowTransitionRuleCreatedResponseDto>> {
    const data = await this.service.addRule(transitionId, dto, tenantId);
    return { status: "success", data };
  }
}
