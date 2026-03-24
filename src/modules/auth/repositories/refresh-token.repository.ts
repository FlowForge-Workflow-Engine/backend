import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, LessThan, Repository } from "typeorm";
import { RefreshToken } from "../entities/refresh-token.entity";
import { BaseRepository, RequestContextService } from "@app/database";
import { DBVariables } from "@app/database/constants/db-variables.enum";
import { DBRoles } from "@app/database/constants/db-roles.enum";

@Injectable()
export class RefreshTokenRepository extends BaseRepository<RefreshToken> {
  constructor(
    @InjectRepository(RefreshToken) readonly entityRepo: Repository<RefreshToken>,
    readonly requestContext: RequestContextService
  ) {
    super(entityRepo, requestContext);
  }

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

    const qr = this.entityRepo.manager.connection.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // ✅ Bypass RLS for superadmin
      await qr.query(`SELECT set_config($1, $2, true)`, [DBVariables.APP_ROLE, DBRoles.SUPERADMIN]);

      const result = await qr.manager.delete(RefreshToken, {
        createdAt: LessThan(cutoffTime),
      });

      await qr.commitTransaction();
      return result.affected || 0;
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }
}
