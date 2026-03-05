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
import { TenantId } from '@app/shared/decorators/tenant-id.decorator';
import { WorkflowStateService } from '../services/workflow-state.service';
import { CreateWorkflowStateDto } from '../dto/create-workflow-state.dto';

/**
 * Nested resource under workflow definitions.
 * Routes: /workflow-definitions/:id/states
 */
@ApiTags('Workflow States')
@ApiBearerAuth()
@Controller('workflow-definitions/:id/states')
export class WorkflowStateController {
  constructor(private readonly service: WorkflowStateService) {}

  @Get()
  @ApiOperation({ summary: 'List all states for a workflow definition' })
  findAll(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
  ) {
    return this.service.findAll(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a state to a draft workflow definition' })
  create(
    @Param() { id }: IdParamDto,
    @Body() dto: CreateWorkflowStateDto,
    @TenantId() tenantId: string,
  ) {
    return this.service.create(id, dto, tenantId);
  }

  @Get(':stateId')
  @ApiOperation({ summary: 'Get a specific state by ID' })
  findOne(
    @Param('stateId') stateId: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.findById(stateId, tenantId);
  }

  @Delete(':stateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a state from a draft workflow definition' })
  remove(
    @Param('stateId') stateId: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.remove(stateId, tenantId);
  }
}

