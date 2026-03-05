import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { IdParamDto } from "@app/shared/dto/id-param.dto";
import { AppErrors } from "@app/shared/constants/app-errors.enum";
import { WebhookConfigRepository } from "../repositories/webhook-config.repository";
import { CreateWebhookConfigDto } from "../dto/create-webhook-config.dto";
import { RedisService } from "../../../infra/redis.service";
import { CacheKeys } from "../../../infra/cache-keys";

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
  create(@Body() dto: CreateWebhookConfigDto, @TenantId() tenantId: string) {
    return this.webhookConfigRepository.insert({ ...dto, tenantId });
  }

  @Get()
  @ApiOperation({ summary: "List all webhook configurations for the tenant" })
  findAll(@TenantId() tenantId: string) {
    return this.webhookConfigRepository.findAllByTenant(tenantId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a webhook configuration by ID" })
  async findOne(@Param() { id }: IdParamDto, @TenantId() tenantId: string) {
    const config = await this.webhookConfigRepository.findById(id, tenantId);
    if (!config) throw new NotFoundException(AppErrors.WEBHOOK_CONFIG_NOT_FOUND);
    return config;
  }

  @Put(":id")
  @ApiOperation({ summary: "Update a webhook configuration" })
  async update(
    @Param() { id }: IdParamDto,
    @TenantId() tenantId: string,
    @Body() dto: Partial<CreateWebhookConfigDto>
  ) {
    const updated = await this.webhookConfigRepository.update(id, tenantId, dto);
    if (!updated) throw new NotFoundException(AppErrors.WEBHOOK_CONFIG_NOT_FOUND);
    // Invalidate webhook cache for this event name
    if (updated.eventName) {
      await this.redis.del(CacheKeys.notifWebhooks(tenantId, updated.eventName));
    }
    return updated;
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a webhook configuration" })
  async remove(@Param() { id }: IdParamDto, @TenantId() tenantId: string) {
    const config = await this.webhookConfigRepository.findById(id, tenantId);
    if (!config) throw new NotFoundException(AppErrors.WEBHOOK_CONFIG_NOT_FOUND);
    await this.webhookConfigRepository.remove(id, tenantId);
    // Invalidate webhook cache for this event name
    await this.redis.del(CacheKeys.notifWebhooks(tenantId, config.eventName));
    return { message: "Webhook configuration deleted" };
  }
}
