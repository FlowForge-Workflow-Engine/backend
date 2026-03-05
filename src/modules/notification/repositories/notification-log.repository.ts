import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationLog, NotificationStatus } from '../entities/notification-log.entity';

@Injectable()
export class NotificationLogRepository {
  constructor(
    @InjectRepository(NotificationLog)
    private readonly repo: Repository<NotificationLog>,
  ) {}

  insert(data: Partial<NotificationLog>): Promise<NotificationLog> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async updateStatus(
    id: string,
    status: NotificationStatus,
    sentAt?: Date,
    errorMessage?: string,
  ): Promise<void> {
    await this.repo.update(id, {
      status,
      sentAt: sentAt ?? null,
      errorMessage: errorMessage ?? null,
    });
  }

  async incrementRetry(id: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(NotificationLog)
      .set({ retryCount: () => 'retry_count + 1' })
      .where('id = :id', { id })
      .execute();
  }
}

