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
import { WebhookConfigRepository } from "../repositories/webhook-config.repository";
import { CreateWebhookConfigDto } from "../dto/create-webhook-config.dto";
import { FindWebhookConfigDto } from "../dto/find-webhook-config.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";
import {
  WebhookConfigListResponseDto,
  WebhookConfigDetailResponseDto,
  WebhookConfigCreatedResponseDto,
  WebhookConfigUpdatedResponseDto,
} from "../dto/dto-response/webhook-config-response.dto";

@ApiTags("Webhook Configurations")
@ApiBearerAuth()
@Controller("webhook-configs")
export class WebhookConfigController {
  constructor(
    private readonly webhookConfigRepository: WebhookConfigRepository,
    private readonly redis: RedisService
  ) {}

  @Post()
  @ApiOperation({ summary: "Register a new webhook configuration" })
  @ApiSuccessResponse(WebhookConfigCreatedResponseDto, "Webhook configuration created successfully", {
    created: true,
  })
  async create(
    @Body() dto: CreateWebhookConfigDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WebhookConfigCreatedResponseDto>> {
    const data = await this.webhookConfigRepository.insert({ ...dto, tenantId });
    return { status: "success", data };
  }

  @Get()
  @ApiOperation({ summary: "List all webhook configurations for the tenant" })
  @ApiSuccessResponse(WebhookConfigListResponseDto, "Webhook configurations retrieved successfully", {
    isArray: true,
  })
  async findAll(
    @Query() dto: FindWebhookConfigDto,
    @TenantId() tenantId: string
  ): Promise<CountApiResponseDto<WebhookConfigListResponseDto[]>> {
    const data = await this.webhookConfigRepository.findAllByTenant(tenantId, dto);
    return { status: "success", count: data.length, data };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a webhook configuration by ID" })
  @ApiSuccessResponse(WebhookConfigDetailResponseDto, "Webhook configuration retrieved successfully")
  @ApiParam({ name: "id", description: "Webhook configuration UUID", format: "uuid" })
  async findOne(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string
  ): Promise<ApiResponseDto<WebhookConfigDetailResponseDto>> {
    const config = await this.webhookConfigRepository.findById(id, tenantId);
    if (!config) throw new NotFoundException(AppErrors.WEBHOOK_CONFIG_NOT_FOUND);
    return { status: "success", data: config };
  }

  @Put(":id")
  @ApiOperation({ summary: "Update a webhook configuration" })
  @ApiSuccessResponse(WebhookConfigUpdatedResponseDto, "Webhook configuration updated successfully")
  @ApiParam({ name: "id", description: "Webhook configuration UUID", format: "uuid" })
  async update(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
    @Body() dto: Partial<CreateWebhookConfigDto>
  ): Promise<ApiResponseDto<WebhookConfigUpdatedResponseDto>> {
    const updated = await this.webhookConfigRepository.update(id, tenantId, dto);
    if (!updated) throw new NotFoundException(AppErrors.WEBHOOK_CONFIG_NOT_FOUND);
    // Invalidate webhook cache for this event name
    if (updated.name) {
      await this.redis.del(CacheKeys.notifWebhooks(tenantId, updated.name));
    }
    return { status: "success", data: updated };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a webhook configuration" })
  async remove(@Param() { id }: IdParamDto, @TenantId() tenantId: string): Promise<void> {
    const config = await this.webhookConfigRepository.findById(id, tenantId);
    if (!config) throw new NotFoundException(AppErrors.WEBHOOK_CONFIG_NOT_FOUND);
    await this.webhookConfigRepository.remove(id, tenantId);
    // Invalidate webhook cache for this event name
    await this.redis.del(CacheKeys.notifWebhooks(tenantId, config.name));
  }
}
