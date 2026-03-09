import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";

/**
 * Service responsible for cleaning up expired refresh tokens.
 * Runs a scheduled cron job daily at 12:00 PM to remove tokens older than 36 hours.
 */
@Injectable()
export class RefreshTokenCleanupService implements OnModuleInit {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(private readonly refreshTokenRepository: RefreshTokenRepository) {}

  onModuleInit() {
    this.logger.log(
      "RefreshTokenCleanupService initialized — will run daily at 12:00 PM to remove tokens older than 36 hours"
    );
  }

  /**
   * Cron job that runs daily at 12:00 PM (noon).
   * Deletes all refresh tokens that are 36 hours or older.
   * This ensures that stale tokens don't accumulate in the database.
   */
  @Cron("0 12 * * *") // Runs every day at 12:00 PM
  async cleanupExpiredTokens(): Promise<void> {
    try {
      this.logger.log("Starting refresh token cleanup job...");

      // Delete tokens older than 36 hours
      const hoursOld = 36;
      const deletedCount = await this.refreshTokenRepository.deleteOldTokens(hoursOld);

      this.logger.log(
        `Refresh token cleanup completed. Deleted ${deletedCount} tokens older than ${hoursOld} hours.`
      );
    } catch (error) {
      this.logger.error(
        `Error during refresh token cleanup: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      // Don't throw - we want the cron job to continue running even if one execution fails
    }
  }
}
