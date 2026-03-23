import { Injectable, Logger } from "@nestjs/common";
import { DataSource, QueryRunner } from "typeorm";
import { RequestContextService } from "./request-context.service";
import { DBRoles } from "../constants/db-roles.enum";
import { DBVariables } from "../constants/db-variables.enum";
import { sha256 } from "@app/shared/utils/hashes/hash";

/**
 * RlsContextService - Manages PostgreSQL Row-Level Security (RLS) session context
 *
 * This service provides centralized management of tenant context for RLS policies.
 * It handles setting and clearing the PostgreSQL session variables that RLS policies
 * use to filter data by tenant.
 *
 */
@Injectable()
export class RlsContextService {
  private readonly logger = new Logger(RlsContextService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly requestContext: RequestContextService
  ) {}

  /**
   * Sets the tenant context in PostgreSQL session for RLS.
   * This session variable is used by RLS policies to filter data by tenant.
   *
   * @param tenantId - The tenant ID to set as context
   * @returns Promise<void>
   * @throws Error - If unable to connect to database or set session variable
   */
  async setTenantContext(
    tenantId: string,
    tenantSlug: string,
    refreshToken: string,
    isPublic: boolean
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      // ✅ Reset all config variables before setting new values\
      // ✅ It resets the session-level value explicitly before the transaction starts
      await this.resetStateBeforeTransaction(queryRunner);

      await queryRunner.startTransaction(); // ← START before any SET/set_config

      // 🧠 ROLE SWITCHING
      if (isPublic) {
        await queryRunner.query(`SET LOCAL ROLE ${DBRoles.PUBLIC_USER}`);

        // Public routes may use slug or tenant_id
        if (tenantSlug)
          await queryRunner.query(`SELECT set_config('app.tenant_slug', $1::text, true)`, [tenantSlug]);
        if (tenantId)
          await queryRunner.query(`SELECT set_config('app.tenant_id', $1::text, true)`, [tenantId]);
        if (refreshToken)
          await queryRunner.query(`SELECT set_config('app.token_hash', $1::text, true)`, [
            sha256(refreshToken),
          ]);
      } else {
        // Authenticated routes
        await queryRunner.query(`SET LOCAL ROLE ${DBRoles.TENANT_USER}`);

        if (!tenantId) {
          throw new Error("Missing tenant_id in authenticated request");
        }

        await queryRunner.query(`SELECT set_config('app.tenant_id', $1::text, true)`, [tenantId]);
      }

      // // Set the tenant context that RLS policies will use
      // await queryRunner.query("SELECT set_config('app.tenant_id', $1::text, false)", [tenantId]);

      this.requestContext.setQueryRunner(queryRunner);
      this.requestContext.setTenantId(tenantId);

      this.logger.debug(
        `DB Context → role: ${isPublic ? DBRoles.PUBLIC_USER : DBRoles.TENANT_USER}, tenantId: ${tenantId}, tenantSlug: ${tenantSlug} refreshToken: ${refreshToken?.slice(0, 10)}...`
      );
    } catch (error) {
      // Ensure the query runner is released on error
      await queryRunner.rollbackTransaction();
      await queryRunner.release();

      this.logger.error(`Failed to set RLS context for tenant ${tenantId}:`, error.message);
      throw error;
    }
  }

  /**
   * Returns the current tenant context (QueryRunner) for the request.
   * @returns QueryRunner | undefined
   */
  getTenantContext(): QueryRunner | undefined {
    return this.requestContext.getQueryRunner();
  }

  /**
   * Resets the RLS context before starting a transaction.
   *
   * This is important to ensure that the transaction does not inherit the RLS context of the previous request or session
   *
   * It resets the session-level value explicitly before the transaction starts
   *
   * @param queryRunner - The QueryRunner to use
   */
  async resetStateBeforeTransaction(queryRunner: QueryRunner) {
    await queryRunner.query(`
        SELECT 
          set_config('${DBVariables.APP_TENANT_ID}', NULL, false),
          set_config('${DBVariables.APP_TENANT_SLUG}', NULL, false),
          set_config('${DBVariables.APP_TOKEN_HASH}', NULL, false),
          set_config('${DBVariables.APP_ROLE}', NULL, false)
      `);
  }
}
