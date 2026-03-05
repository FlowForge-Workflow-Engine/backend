import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookConfig } from '../entities/webhook-config.entity';
import { WebhookDeliveryLogRepository } from '../repositories/webhook-delivery-log.repository';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly webhookDeliveryLogRepository: WebhookDeliveryLogRepository,
  ) {}

  /**
   * Delivers a JSON payload to the configured webhook URL via HTTP POST.
   *
   * Signature header format:
   *   X-Workflow-Signature: sha256=<HMAC-SHA256-hex>
   *
   * The HMAC is computed over the raw JSON body using the config's `secret`.
   */
  async deliver(
    config: WebhookConfig,
    eventName: string,
    payload: Record<string, unknown>,
    attemptNumber = 1,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.computeSignature(body, config.secret);

    let httpStatus: number | null = null;
    let responseBody: string | null = null;
    let deliveredAt: Date | null = null;

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workflow-Signature': `sha256=${signature}`,
          'X-Workflow-Event': eventName,
        },
        body,
      });

      httpStatus = response.status;
      responseBody = await response.text();

      if (response.ok) {
        deliveredAt = new Date();
        this.logger.log(
          `Webhook delivered [configId=${config.id}] [event=${eventName}] [status=${httpStatus}]`,
        );
      } else {
        this.logger.warn(
          `Webhook non-2xx [configId=${config.id}] [event=${eventName}] [status=${httpStatus}]`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Webhook delivery failed [configId=${config.id}] [event=${eventName}]: ${message}`,
      );
    } finally {
      await this.webhookDeliveryLogRepository.insert({
        tenantId: config.tenantId,
        webhookConfigId: config.id,
        eventName,
        payload,
        httpStatus,
        responseBody,
        attemptNumber,
        deliveredAt,
      });
    }
  }

  private computeSignature(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  }
}

