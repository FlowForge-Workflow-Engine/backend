import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@app/shared/decorators/current-user.decorator";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto, CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { WorkflowExecutionService } from "../services/workflow-execution.service";
import { CreateInstanceDto } from "../dto/create-instance.dto";
import { ExecuteTransitionDto } from "../dto/execute-transition.dto";
import { FindWorkflowInstanceDto } from "../dto/find-workflow-instance.dto";
import {
  WorkflowExecutionListResponseDto,
  WorkflowExecutionDetailResponseDto,
  WorkflowExecutionCreatedResponseDto,
  WorkflowExecutionTransitionedResponseDto,
} from "../dto/dto-response/workflow-execution-response.dto";

@ApiTags("Workflow Instances")
@ApiBearerAuth()
@Controller("workflow-instances")
export class WorkflowExecutionController {
  constructor(private readonly executionService: WorkflowExecutionService) {}

  @Post()
  @ApiOperation({ summary: "Create a new workflow instance" })
  @ApiSuccessResponse(WorkflowExecutionCreatedResponseDto, "Workflow instance created successfully", {
    created: true,
  })
  async create(
    @Body() dto: CreateInstanceDto,
    @CurrentUser() actor: IJwtPayload
  ): Promise<ApiResponseDto<WorkflowExecutionCreatedResponseDto>> {
    const data = await this.executionService.createInstance(dto.workflowDefinitionId, dto.payload, actor);
    return { status: "success", data };
  }

  @Get()
  @ApiOperation({ summary: "List workflow instances (paginated)" })
  @ApiSuccessResponse(WorkflowExecutionListResponseDto, "Workflow instances retrieved successfully", {
    isArray: true,
  })
  async list(
    @Query() dto: FindWorkflowInstanceDto,
    @TenantId() tenantId: string
  ): Promise<CountApiResponseDto<WorkflowExecutionListResponseDto[]>> {
    const result = await this.executionService.getInstanceList(dto, tenantId);
    return { status: "success", count: result.data.length, data: result.data };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get workflow instance details" })
  @ApiSuccessResponse(WorkflowExecutionDetailResponseDto, "Workflow instance retrieved successfully")
  async getOne(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowExecutionDetailResponseDto>> {
    const data = await this.executionService.getInstanceDetail(id, tenantId);
    return { status: "success", data };
  }

  @Get(":id/allowed-transitions")
  @ApiOperation({ summary: "List transitions available to the current user for this instance" })
  async getAllowedTransitions(
    @Param() { id }: IdParamDto,
    @CurrentUser() actor: IJwtPayload
  ): Promise<unknown> {
    return this.executionService.getAllowedTransitions(id, actor.tenantId, actor.roles);
  }

  @Post(":id/transitions")
  @ApiOperation({ summary: "Execute a transition on a workflow instance" })
  @ApiSuccessResponse(WorkflowExecutionTransitionedResponseDto, "Workflow instance transitioned successfully")
  async executeTransition(
    @Param() { id }: IdParamDto,
    @Body() dto: ExecuteTransitionDto,
    @CurrentUser() actor: IJwtPayload
  ): Promise<ApiResponseDto<WorkflowExecutionTransitionedResponseDto>> {
    const data = await this.executionService.executeTransition(
      id,
      dto.transitionId,
      dto.expectedVersion,
      dto.comment,
      actor,
      dto.idempotencyKey
    );
    return { status: "success", data };
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel an active workflow instance" })
  async cancel(
    @Param() { id }: IdParamDto,
    @CurrentUser() actor: IJwtPayload
  ): Promise<ApiResponseDto<WorkflowExecutionTransitionedResponseDto>> {
    const data = await this.executionService.cancelInstance(id, actor);
    return { status: "success", data };
  }
}
