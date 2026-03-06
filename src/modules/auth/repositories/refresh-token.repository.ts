import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, LessThan, Repository } from "typeorm";
import { RefreshToken } from "../entities/refresh-token.entity";

@Injectable()
export class RefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>
  ) {}

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.repo.findOne({ where: { tokenHash, revokedAt: IsNull() } });
  }

  async create(data: {
    tenantId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    const token = this.repo.create({ ...data, revokedAt: null });
    return this.repo.save(token);
  }

  async revoke(id: string): Promise<void> {
    await this.repo.update(id, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string, tenantId: string): Promise<void> {
    await this.repo.update(
      { userId, tenantId, revokedAt: IsNull() as unknown as Date },
      { revokedAt: new Date() }
    );
  }

  /**
   * Delete refresh tokens that are older than the specified hours.
   * Used by the cleanup cron job to remove stale tokens.
   * @param hoursOld - Number of hours to consider a token as old (e.g., 36 hours)
   * @returns Number of tokens deleted
   */
  async deleteOldTokens(hoursOld: number): Promise<number> {
    const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    const result = await this.repo.delete({
      createdAt: LessThan(cutoffTime),
    });
    return result.affected || 0;
  }
}
