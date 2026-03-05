import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookDeliveryLog } from '../entities/webhook-delivery-log.entity';

@Injectable()
export class WebhookDeliveryLogRepository {
  constructor(
    @InjectRepository(WebhookDeliveryLog)
    private readonly repo: Repository<WebhookDeliveryLog>,
  ) {}

  insert(data: Partial<WebhookDeliveryLog>): Promise<WebhookDeliveryLog> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }
}

