import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@app/shared/decorators/current-user.decorator";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { WorkflowExecutionService } from "../services/workflow-execution.service";
import { CreateInstanceDto } from "../dto/create-instance.dto";
import { ExecuteTransitionDto } from "../dto/execute-transition.dto";
import { WorkflowInstanceStatus } from "../enums/workflow-instance-status";

@ApiTags("Workflow Instances")
@ApiBearerAuth()
@Controller("workflow-instances")
export class WorkflowExecutionController {
  constructor(private readonly executionService: WorkflowExecutionService) {}

  @Post()
  @ApiOperation({ summary: "Create a new workflow instance" })
  create(@Body() dto: CreateInstanceDto, @CurrentUser() actor: IJwtPayload) {
    return this.executionService.createInstance(dto.workflowDefinitionId, dto.payload ?? {}, actor);
  }

  @Get()
  @ApiOperation({ summary: "List workflow instances (paginated)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "status", required: false, enum: WorkflowInstanceStatus })
  @ApiQuery({ name: "workflowDefinitionId", required: false, type: String })
  list(
    @TenantId() tenantId: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
    @Query("status") status?: WorkflowInstanceStatus,
    @Query("workflowDefinitionId") workflowDefinitionId?: string
  ) {
    return this.executionService.getInstanceList(
      tenantId,
      Number(page),
      Number(limit),
      status,
      workflowDefinitionId
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get workflow instance details" })
  getOne(@Param() { id }: IdParamDto, @TenantId() tenantId: string) {
    return this.executionService.getInstanceDetail(id, tenantId);
  }

  @Get(":id/allowed-transitions")
  @ApiOperation({ summary: "List transitions available to the current user for this instance" })
  getAllowedTransitions(@Param() { id }: IdParamDto, @CurrentUser() actor: IJwtPayload) {
    return this.executionService.getAllowedTransitions(id, actor.tenantId, actor.roles);
  }

  @Post(":id/transitions")
  @ApiOperation({ summary: "Execute a transition on a workflow instance" })
  executeTransition(
    @Param() { id }: IdParamDto,
    @Body() dto: ExecuteTransitionDto,
    @CurrentUser() actor: IJwtPayload
  ) {
    return this.executionService.executeTransition(
      id,
      dto.transitionId,
      dto.expectedVersion,
      dto.comment,
      actor,
      dto.idempotencyKey
    );
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel an active workflow instance" })
  cancel(@Param() { id }: IdParamDto, @CurrentUser() actor: IJwtPayload) {
    return this.executionService.cancelInstance(id, actor);
  }
}
