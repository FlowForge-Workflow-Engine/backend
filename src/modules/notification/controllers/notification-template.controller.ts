import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantId } from '@app/shared/decorators/tenant-id.decorator';
import { IdParamDto } from '@app/shared/dto/id-param.dto';
import { AppErrors } from '@app/shared/constants/app-errors.enum';
import { NotificationTemplateRepository } from '../repositories/notification-template.repository';
import { CreateNotificationTemplateDto } from '../dto/create-notification-template.dto';

@ApiTags('Notification Templates')
@ApiBearerAuth()
@Controller('notification-templates')
export class NotificationTemplateController {
  constructor(private readonly templateRepository: NotificationTemplateRepository) {}

  @Post()
  @ApiOperation({ summary: 'Create a notification template' })
  create(@Body() dto: CreateNotificationTemplateDto, @TenantId() tenantId: string) {
    return this.templateRepository.insert({ ...dto, tenantId });
  }

  @Get()
  @ApiOperation({ summary: 'List all notification templates for the tenant' })
  findAll(@TenantId() tenantId: string) {
    return this.templateRepository.findAllByTenant(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a notification template by ID' })
  async findOne(@Param() { id }: IdParamDto, @TenantId() tenantId: string) {
    const template = await this.templateRepository.findById(id, tenantId);
    if (!template) throw new NotFoundException(AppErrors.NOTIFICATION_TEMPLATE_NOT_FOUND);
    return template;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a notification template' })
  async update(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
    @Body() dto: Partial<CreateNotificationTemplateDto>,
  ) {
    const updated = await this.templateRepository.update(id, tenantId, dto);
    if (!updated) throw new NotFoundException(AppErrors.NOTIFICATION_TEMPLATE_NOT_FOUND);
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification template' })
  async remove(@Param() { id }: IdParamDto, @TenantId() tenantId: string) {
    const template = await this.templateRepository.findById(id, tenantId);
    if (!template) throw new NotFoundException(AppErrors.NOTIFICATION_TEMPLATE_NOT_FOUND);
    await this.templateRepository.remove(id, tenantId);
    return { message: 'Notification template deleted' };
  }
}

