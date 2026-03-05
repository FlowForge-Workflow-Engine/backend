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
import { WorkflowTransitionService } from '../services/workflow-transition.service';
import { CreateWorkflowTransitionDto } from '../dto/create-workflow-transition.dto';
import { CreateTransitionRuleDto } from '../dto/create-transition-rule.dto';

/**
 * Nested resource under workflow definitions.
 * Routes: /workflow-definitions/:id/transitions
 */
@ApiTags('Workflow Transitions')
@ApiBearerAuth()
@Controller('workflow-definitions/:id/transitions')
export class WorkflowTransitionController {
  constructor(private readonly service: WorkflowTransitionService) {}

  @Get()
  @ApiOperation({ summary: 'List all transitions for a workflow definition' })
  findAll(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
  ) {
    return this.service.findAll(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a transition to a draft workflow definition' })
  create(
    @Param() { id }: IdParamDto,
    @Body() dto: CreateWorkflowTransitionDto,
    @TenantId() tenantId: string,
  ) {
    return this.service.create(id, dto, tenantId);
  }

  @Get(':transitionId')
  @ApiOperation({ summary: 'Get a specific transition by ID' })
  findOne(
    @Param('transitionId') transitionId: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.findById(transitionId, tenantId);
  }

  @Delete(':transitionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a transition and its rules' })
  remove(
    @Param('transitionId') transitionId: string,
    @TenantId() tenantId: string,
  ) {
    return this.service.remove(transitionId, tenantId);
  }

  @Post(':transitionId/rules')
  @ApiOperation({ summary: 'Attach a rule to a workflow transition' })
  addRule(
    @Param('transitionId') transitionId: string,
    @Body() dto: CreateTransitionRuleDto,
    @TenantId() tenantId: string,
  ) {
    return this.service.addRule(transitionId, dto, tenantId);
  }
}

