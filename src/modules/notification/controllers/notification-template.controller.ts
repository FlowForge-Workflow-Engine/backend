import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto, CountApiResponseDto } from "@app/shared/dto/base-response.dto";
import { NotificationTemplateRepository } from "../repositories/notification-template.repository";
import { CreateNotificationTemplateDto } from "../dto/create-notification-template.dto";
import { FindNotificationTemplateDto } from "../dto/find-notification-template.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import {
  NotificationTemplateListResponseDto,
  NotificationTemplateDetailResponseDto,
  NotificationTemplateCreatedResponseDto,
  NotificationTemplateUpdatedResponseDto,
} from "../dto/dto-response/notification-template-response.dto";

@ApiTags("Notification Templates")
@ApiBearerAuth()
@Controller("notification-templates")
export class NotificationTemplateController {
  constructor(
    private readonly templateRepository: NotificationTemplateRepository,
    private readonly redis: RedisService
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a notification template" })
  @ApiSuccessResponse(NotificationTemplateCreatedResponseDto, "Notification template created successfully", {
    created: true,
  })
  async create(
    @Body() dto: CreateNotificationTemplateDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<NotificationTemplateCreatedResponseDto>> {
    const data = await this.templateRepository.insert({ ...dto, tenantId });
    return { status: "success", data };
  }

  @Get()
  @ApiOperation({ summary: "List all notification templates for the tenant" })
  @ApiSuccessResponse(NotificationTemplateListResponseDto, "Notification templates retrieved successfully", {
    isArray: true,
  })
  async findAll(
    @Query() dto: FindNotificationTemplateDto,
    @TenantId() tenantId: string
  ): Promise<CountApiResponseDto<NotificationTemplateListResponseDto[]>> {
    const data = await this.templateRepository.findAllByTenant(tenantId, dto);
    return { status: "success", count: data.length, data };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a notification template by ID" })
  @ApiSuccessResponse(NotificationTemplateDetailResponseDto, "Notification template retrieved successfully")
  @ApiParam({ name: "id", description: "Notification template UUID", format: "uuid" })
  async findOne(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<NotificationTemplateDetailResponseDto>> {
    const template = await this.templateRepository.findById(id, tenantId);
    if (!template) throw new NotFoundException(AppErrors.NOTIFICATION_TEMPLATE_NOT_FOUND);
    return { status: "success", data: template };
  }

  @Put(":id")
  @ApiOperation({ summary: "Update a notification template" })
  @ApiSuccessResponse(NotificationTemplateUpdatedResponseDto, "Notification template updated successfully")
  @ApiParam({ name: "id", example: "550e8400-e29b...", description: "Notification template UUID" })
  async update(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
    @Body() dto: Partial<CreateNotificationTemplateDto>
  ): Promise<ApiResponseDto<NotificationTemplateUpdatedResponseDto>> {
    const updated = await this.templateRepository.update(id, tenantId, dto);
    if (!updated) throw new NotFoundException(AppErrors.NOTIFICATION_TEMPLATE_NOT_FOUND);
    // Invalidate template cache for this event trigger
    if (updated.eventTrigger) {
      await this.redis.del(CacheKeys.notifTemplates(tenantId, updated.eventTrigger));
    }
    return { status: "success", data: updated };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a notification template" })
  async remove(@Param() { id }: IdParamDto, @TenantId() tenantId: string): Promise<void> {
    const template = await this.templateRepository.findById(id, tenantId);
    if (!template) throw new NotFoundException(AppErrors.NOTIFICATION_TEMPLATE_NOT_FOUND);
    await this.templateRepository.remove(id, tenantId);
    // Invalidate template cache for this event trigger
    await this.redis.del(CacheKeys.notifTemplates(tenantId, template.eventTrigger));
  }
}
