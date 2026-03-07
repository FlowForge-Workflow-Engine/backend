import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { CurrentUser } from "@app/shared/decorators/current-user.decorator";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto, CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { WorkflowDefinitionService } from "../services/workflow-definition.service";
import { CreateWorkflowDefinitionDto } from "../dto/create-workflow-definition.dto";
import { FindWorkflowDefinitionDto } from "../dto/find-workflow-definition.dto";
import {
  WorkflowDefinitionListResponseDto,
  WorkflowDefinitionDetailResponseDto,
  WorkflowDefinitionCreatedResponseDto,
  WorkflowDefinitionPublishedResponseDto,
  WorkflowDefinitionDeprecatedResponseDto,
  WorkflowDefinitionVersionListResponseDto,
  WorkflowDefinitionVersionDetailResponseDto,
} from "../dto/dto-response/workflow-definition-response.dto";
import { InstanceFormSchemaResponseDto } from "../dto/dto-response/instance-form-schema-response.dto";

@ApiTags("Workflow Definitions")
@ApiBearerAuth()
@Controller("workflow-definitions")
export class WorkflowDefinitionController {
  constructor(private readonly service: WorkflowDefinitionService) {}

  @Get()
  @ApiOperation({ summary: "List all workflow definitions for the tenant" })
  @ApiSuccessResponse(WorkflowDefinitionListResponseDto, "Workflow definitions retrieved successfully", {
    isArray: true,
  })
  async findAll(
    @Query() dto: FindWorkflowDefinitionDto,
    @TenantId() tenantId: string
  ): Promise<CountApiResponseDto<WorkflowDefinitionListResponseDto[]>> {
    const result = await this.service.findAll(dto, tenantId);

    // Return the total tenant-scoped definition count so the UI can paginate across all matching records.
    return { status: "success", count: result.total, data: result.data };
  }

  @Post()
  @ApiOperation({ summary: "Create a new workflow definition (draft)" })
  @ApiSuccessResponse(WorkflowDefinitionCreatedResponseDto, "Workflow definition created successfully", {
    created: true,
  })
  async create(
    @Body() dto: CreateWorkflowDefinitionDto,
    @TenantId() tenantId: string,
    @CurrentUser() actor: IJwtPayload
  ): Promise<ApiResponseDto<WorkflowDefinitionCreatedResponseDto>> {
    const data = await this.service.create(dto, tenantId, actor.sub);
    return { status: "success", data };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a workflow definition by ID" })
  @ApiSuccessResponse(WorkflowDefinitionDetailResponseDto, "Workflow definition retrieved successfully")
  async findOne(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowDefinitionDetailResponseDto>> {
    const data = await this.service.findById(id, tenantId);
    return { status: "success", data };
  }

  @Get(":id/instance-form-schema")
  @ApiOperation({ summary: "Get the client-facing instance form schema for a workflow definition" })
  @ApiSuccessResponse(InstanceFormSchemaResponseDto, "Workflow instance form schema retrieved successfully")
  async getInstanceFormSchema(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<InstanceFormSchemaResponseDto>> {
    const schema = await this.service.getInstanceFormSchema(id, tenantId);
    const data = InstanceFormSchemaResponseDto.fromSchema(schema);
    return { status: "success", data };
  }

  @Get(":id/versions")
  @ApiOperation({ summary: "Get workflow definition basic info with all published versions" })
  @ApiSuccessResponse(
    WorkflowDefinitionVersionListResponseDto,
    "Workflow definition versions retrieved successfully"
  )
  async findVersions(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowDefinitionVersionListResponseDto>> {
    const { definition, versions } = await this.service.findVersions(id, tenantId);
    const data = WorkflowDefinitionVersionListResponseDto.fromEntities(definition, versions);
    return { status: "success", data };
  }

  @Get(":id/versions/:versionNumber")
  @ApiOperation({ summary: "Get immutable workflow definition version details by version number" })
  @ApiSuccessResponse(
    WorkflowDefinitionVersionDetailResponseDto,
    "Workflow definition version retrieved successfully"
  )
  async findVersionByNumber(
    @Param() { id }: IdParamDto,
    @Param("versionNumber", ParseIntPipe) versionNumber: number,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WorkflowDefinitionVersionDetailResponseDto>> {
    const version = await this.service.findVersionByNumber(id, versionNumber, tenantId);
    const data = WorkflowDefinitionVersionDetailResponseDto.fromEntity(version);
    return { status: "success", data };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a draft workflow definition" })
  async remove(@Param() { id }: IdParamDto, @TenantId() tenantId: string): Promise<void> {
    await this.service.remove(id, tenantId);
  }

  @Post(":id/publish")
  @ApiOperation({ summary: "Publish a workflow definition — creates an immutable version snapshot" })
  @ApiSuccessResponse(WorkflowDefinitionPublishedResponseDto, "Workflow definition published successfully", {
    created: true,
  })
  async publish(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
    @CurrentUser() actor: IJwtPayload
  ): Promise<ApiResponseDto<WorkflowDefinitionPublishedResponseDto>> {
    const data = await this.service.publish(id, tenantId, actor);
    return { status: "success", data };
  }

  @Post(":id/deprecate")
  @ApiOperation({ summary: "Deprecate a published workflow definition" })
  @ApiSuccessResponse(WorkflowDefinitionDeprecatedResponseDto, "Workflow definition deprecated successfully")
  async deprecate(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
    @CurrentUser() actor: IJwtPayload
  ): Promise<ApiResponseDto<WorkflowDefinitionDeprecatedResponseDto>> {
    const data = await this.service.deprecate(id, tenantId, actor.sub);
    return { status: "success", data };
  }
}
