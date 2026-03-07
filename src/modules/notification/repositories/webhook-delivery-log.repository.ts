import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { WebhookDeliveryLog } from "../entities/webhook-delivery-log.entity";

@Injectable()
export class WebhookDeliveryLogRepository {
  constructor(
    @InjectRepository(WebhookDeliveryLog)
    private readonly repo: Repository<WebhookDeliveryLog>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Purpose: persist webhook delivery attempts for NATS-triggered notifications under tenant DB context.
   */
  async insert(data: Partial<WebhookDeliveryLog>): Promise<WebhookDeliveryLog> {
    const tenantId = data.tenantId;
    if (!tenantId) throw new Error("WebhookDeliveryLogRepository.insert requires tenantId.");

    return this.dataSource.transaction(async (manager) => {
      // Set transaction-local tenant context before writing to the RLS-protected webhook delivery log table.
      await manager.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);
      const repo = manager.getRepository(WebhookDeliveryLog);
      return repo.save(repo.create(data));
    });
  }
}
