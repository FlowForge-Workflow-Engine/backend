import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IdParamDto } from '@app/shared/dto/id-param.dto';
import { CurrentUser } from '@app/shared/decorators/current-user.decorator';
import { TenantId } from '@app/shared/decorators/tenant-id.decorator';
import { IJwtPayload } from '@app/shared/interfaces/jwt-payload.interface';
import { WorkflowDefinitionService } from '../services/workflow-definition.service';
import { CreateWorkflowDefinitionDto } from '../dto/create-workflow-definition.dto';

@ApiTags('Workflow Definitions')
@ApiBearerAuth()
@Controller('workflow-definitions')
export class WorkflowDefinitionController {
  constructor(private readonly service: WorkflowDefinitionService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflow definitions for the tenant' })
  findAll(@TenantId() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new workflow definition (draft)' })
  create(
    @Body() dto: CreateWorkflowDefinitionDto,
    @TenantId() tenantId: string,
    @CurrentUser() actor: IJwtPayload,
  ) {
    return this.service.create(dto, tenantId, actor.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a workflow definition by ID' })
  findOne(@Param() { id }: IdParamDto, @TenantId() tenantId: string) {
    return this.service.findById(id, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft workflow definition' })
  remove(@Param() { id }: IdParamDto, @TenantId() tenantId: string) {
    return this.service.remove(id, tenantId);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a workflow definition — creates an immutable version snapshot' })
  publish(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
    @CurrentUser() actor: IJwtPayload,
  ) {
    return this.service.publish(id, tenantId, actor.sub);
  }

  @Post(':id/deprecate')
  @ApiOperation({ summary: 'Deprecate a published workflow definition' })
  deprecate(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
    @CurrentUser() actor: IJwtPayload,
  ) {
    return this.service.deprecate(id, tenantId, actor.sub);
  }
}

