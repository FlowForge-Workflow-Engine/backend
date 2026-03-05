import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeUserShadow } from '../entities/we-user-shadow.entity';

@Injectable()
export class UserShadowRepository {
  constructor(
    @InjectRepository(WeUserShadow)
    private readonly repo: Repository<WeUserShadow>,
  ) {}

  async findById(id: string): Promise<WeUserShadow | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Idempotent upsert — safe to call multiple times with the same event.
   * On conflict (same id), update all mutable fields.
   */
  async upsert(data: Omit<WeUserShadow, never>): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(WeUserShadow)
      .values(data)
      .orUpdate(['email', 'full_name', 'roles', 'is_active', 'synced_at'], ['id'])
      .execute();
  }

  async updateRoles(id: string, roles: string[], syncedAt: Date): Promise<void> {
    await this.repo.update({ id }, { roles, syncedAt });
  }

  async deactivate(id: string, syncedAt: Date): Promise<void> {
    await this.repo.update({ id }, { isActive: false, syncedAt });
  }
}

