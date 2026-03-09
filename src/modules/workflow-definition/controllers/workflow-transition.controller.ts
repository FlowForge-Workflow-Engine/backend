import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto, CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { WorkflowTransitionService } from "../services/workflow-transition.service";
import { CreateWorkflowTransitionDto } from "../dto/create-workflow-transition.dto";
import { CreateTransitionRuleDto } from "../dto/create-transition-rule.dto";
import { FindWorkflowTransitionDto } from "../dto/find-workflow-transition.dto";
import {
  WorkflowTransitionListResponseDto,
  WorkflowTransitionDetailResponseDto,
  WorkflowTransitionCreatedResponseDto,
  WorkflowTransitionRuleCreatedResponseDto,
} from "../dto/dto-response/workflow-transition-response.dto";
import { TransitionRuleDto } from "../dto/dto-response/transition-rule-response.dto";

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
  @ApiParam({ name: "id", description: "Workflow definition UUID", format: "uuid" })
  async findAll(
    @Query() dto: FindWorkflowTransitionDto,
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string
  ): Promise<CountApiResponseDto<WorkflowTransitionListResponseDto[]>> {
    const data = await this.service.findAll(dto, id, tenantId);
    return { status: "success", count: data.length, data };
  }

  @Post()
  @ApiOperation({ summary: "Add a transition to a draft workflow definition" })
  @ApiSuccessResponse(WorkflowTransitionCreatedResponseDto, "Workflow transition created successfully", {
    created: true,
  })
  @ApiParam({ name: "id", description: "Workflow definition UUID", format: "uuid" })
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
  @ApiParam({ name: "transitionId", description: "Workflow transition UUID", format: "uuid" })
  async findOne(
    @Param("transitionId", ParseUUIDPipe) transitionId: string,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowTransitionDetailResponseDto>> {
    const data = await this.service.findById(transitionId, tenantId);
    return { status: "success", data };
  }

  @Delete(":transitionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a transition and its rules" })
  @ApiParam({ name: "transitionId", description: "Workflow transition UUID", format: "uuid" })
  async remove(
    @Param("transitionId", ParseUUIDPipe) transitionId: string,
    @TenantId() tenantId: string
  ): Promise<void> {
    await this.service.remove(transitionId, tenantId);
  }

  @Post(":transitionId/rules")
  @ApiOperation({ summary: "Attach a rule to a workflow transition" })
  @ApiSuccessResponse(
    WorkflowTransitionRuleCreatedResponseDto,
    "Workflow transition rule created successfully",
    { created: true }
  )
  @ApiParam({ name: "transitionId", description: "Workflow transition UUID", format: "uuid" })
  async addRule(
    @Param("transitionId", ParseUUIDPipe) transitionId: string,
    @Body() dto: CreateTransitionRuleDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowTransitionRuleCreatedResponseDto>> {
    const data = await this.service.addRule(transitionId, dto, tenantId);
    return { status: "success", data };
  }

  @Get(":transitionId/rules")
  @ApiOperation({ summary: "List all rules of a workflow transition" })
  @ApiSuccessResponse(TransitionRuleDto, "Workflow transition rules fetched successfully", { isArray: true })
  @ApiParam({ name: "transitionId", description: "Workflow transition UUID", format: "uuid" })
  async getAllRules(
    @Param("transitionId", ParseUUIDPipe) transitionId: string,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<TransitionRuleDto[]>> {
    const data = await this.service.getAllRules(transitionId, tenantId);
    return { status: "success", data };
  }

  @Delete(":transitionId/rules/:ruleId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a rule from a draft workflow transition" })
  @ApiParam({ name: "transitionId", description: "Workflow transition UUID", format: "uuid" })
  @ApiParam({ name: "ruleId", description: "Transition rule UUID", format: "uuid" })
  async removeRule(
    @Param("transitionId", ParseUUIDPipe) transitionId: string,
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @TenantId() tenantId: string
  ): Promise<void> {
    await this.service.removeRule(transitionId, ruleId, tenantId);
  }
}
