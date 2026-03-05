import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import { WebhookConfig } from "../entities/webhook-config.entity";
import { WebhookDeliveryLogRepository } from "../repositories/webhook-delivery-log.repository";

/**
 * Service for delivering webhook notifications to external endpoints.
 * Sends JSON payloads via HTTP POST with HMAC-SHA256 signature verification.
 * Logs all delivery attempts with HTTP status and response body for audit trail.
 * Integrates with NotificationSubscriber to handle workflow events.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly webhookDeliveryLogRepository: WebhookDeliveryLogRepository) {}

  /**
   * Delivers a JSON payload to a configured webhook endpoint via HTTP POST.
   * Includes HMAC-SHA256 signature header for payload verification.
   * Logs delivery attempt with HTTP status and response body regardless of success/failure.
   * Does not throw on delivery failure; all outcomes are logged for retry/audit purposes.
   *
   * Signature header format:
   *   X-Workflow-Signature: sha256=<HMAC-SHA256-hex>
   *
   * The HMAC is computed over the raw JSON body using the webhook config's secret.
   *
   * @param config - The webhook configuration containing URL and secret
   * @param eventName - The event type being delivered (e.g., "workflow.transition.completed")
   * @param payload - The JSON payload to deliver
   * @param attemptNumber - The attempt number for retry tracking (default: 1)
   * @returns Promise<void>
   */
  async deliver(
    config: WebhookConfig,
    eventName: string,
    payload: Record<string, unknown>,
    attemptNumber = 1
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.computeSignature(body, config.secret);

    let httpStatus: number | null = null;
    let responseBody: string | null = null;
    let deliveredAt: Date | null = null;

    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Workflow-Signature": `sha256=${signature}`,
          "X-Workflow-Event": eventName,
        },
        body,
      });

      httpStatus = response.status;
      responseBody = await response.text();

      if (response.ok) {
        deliveredAt = new Date();
        this.logger.log(
          `Webhook delivered [configId=${config.id}] [event=${eventName}] [status=${httpStatus}]`
        );
      } else {
        this.logger.warn(
          `Webhook non-2xx [configId=${config.id}] [event=${eventName}] [status=${httpStatus}]`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook delivery failed [configId=${config.id}] [event=${eventName}]: ${message}`);
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

  /**
   * Computes HMAC-SHA256 signature for webhook payload verification.
   * The recipient can verify the signature using the same secret to ensure payload authenticity.
   *
   * @param body - The raw JSON body as string
   * @param secret - The webhook secret key
   * @returns string - HMAC-SHA256 hex digest
   */
  private computeSignature(body: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
  }
}
