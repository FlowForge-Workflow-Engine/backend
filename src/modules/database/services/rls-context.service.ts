import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";

/**
 * RlsContextService - Manages PostgreSQL Row-Level Security (RLS) session context
 *
 * This service provides centralized management of tenant context for RLS policies.
 * It handles setting and clearing the PostgreSQL session variables that RLS policies
 * use to filter data by tenant.
 *
 * ============================================================================
 * CORE FUNCTIONALITY:
 * ============================================================================
 *
 * 1. setTenantContext(tenantId): Sets app.tenant_id in PostgreSQL session
 * 2. clearTenantContext(): Clears the tenant context
 * 3. getCurrentTenantContext(): Gets the current tenant context
 * 4. withTenantContext(): Executes a function with specific tenant context
 *
 * ============================================================================
 * USAGE PATTERNS:
 * ============================================================================
 *
 * // In interceptors (most common)
 * await rlsService.setTenantContext(tenantId);
 *
 * // For admin operations that need to bypass RLS
 * await rlsService.withTenantContext(null, async () => {
 *   // This code runs without tenant filtering
 * });
 *
 * // For cross-tenant operations (super admin)
 * await rlsService.withTenantContext(specificTenantId, async () => {
 *   // This code runs with specific tenant context
 * });
 */
@Injectable()
export class RlsContextService {
  private readonly logger = new Logger(RlsContextService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Sets the tenant context in PostgreSQL session for RLS.
   * This session variable is used by RLS policies to filter data by tenant.
   *
   * @param tenantId - The tenant ID to set as context
   * @returns Promise<void>
   * @throws Error - If unable to connect to database or set session variable
   */
  async setTenantContext(tenantId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      // Set the tenant context that RLS policies will use
      await queryRunner.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);

      this.logger.debug(`RLS context set: tenant_id = ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to set RLS context for tenant ${tenantId}:`, error.message);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Clears the tenant context from PostgreSQL session.
   * This will cause RLS to deny all access (fail-secure principle).
   * Used when exiting a request context or bypassing RLS for admin operations.
   *
   * @returns Promise<void>
   * @throws Error - If unable to connect to database or clear session variable
   */
  async clearTenantContext(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      // Clear the tenant context - this will make RLS deny all access
      await queryRunner.query("SELECT set_config('app.tenant_id', '', true)");

      this.logger.debug("RLS context cleared - access will be denied");
    } catch (error) {
      this.logger.error("Failed to clear RLS context:", error.message);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Retrieves the current tenant context from PostgreSQL session.
   * Returns null if context is not set or is empty string.
   * Gracefully handles database errors by returning null.
   *
   * @returns Promise<string | null> - The current tenant ID or null if not set
   */
  async getCurrentTenantContext(): Promise<string | null> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      const result = await queryRunner.query("SELECT current_setting('app.tenant_id', true) as tenant_id");

      const tenantId = result[0]?.tenant_id;
      return tenantId && tenantId !== "" ? tenantId : null;
    } catch (error) {
      this.logger.error("Failed to get current RLS context:", error.message);
      return null;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Executes a function with a specific tenant context.
   * Automatically saves and restores the previous context after execution.
   * Ensures context isolation for nested operations.
   *
   * @param tenantId - Tenant ID to set (null to clear context and bypass RLS)
   * @param fn - Async function to execute with the tenant context
   * @returns Promise<T> - The result of the function execution
   * @throws Error - If unable to set/restore context or if fn throws
   */
  async withTenantContext<T>(tenantId: string | null, fn: () => Promise<T>): Promise<T> {
    // Save current context
    const previousContext = await this.getCurrentTenantContext();

    try {
      // Set new context
      if (tenantId) {
        await this.setTenantContext(tenantId);
      } else {
        await this.clearTenantContext();
      }

      // Execute function with new context
      return await fn();
    } finally {
      // Restore previous context
      if (previousContext) {
        await this.setTenantContext(previousContext);
      } else {
        await this.clearTenantContext();
      }
    }
  }

  /**
   * Bypasses RLS by temporarily clearing tenant context.
   * USE WITH EXTREME CAUTION - Only for authorized admin operations.
   * Logs a warning when invoked for audit trail purposes.
   * Automatically restores previous context after execution.
   *
   * @param fn - Async function to execute without RLS filtering
   * @returns Promise<T> - The result of the function execution
   * @throws Error - If unable to set/restore context or if fn throws
   */
  async bypassRls<T>(fn: () => Promise<T>): Promise<T> {
    this.logger.warn("RLS bypass requested - ensure this is authorized");
    return this.withTenantContext(null, fn);
  }

  /**
   * Validates that the current session has proper tenant context.
   * Checks that context is set and matches valid UUID format.
   * Used as a safety check before executing tenant-scoped operations.
   *
   * @returns Promise<string> - The validated tenant ID
   * @throws Error - If context is missing, empty, or invalid UUID format
   */
  async validateTenantContext(): Promise<string> {
    const currentContext = await this.getCurrentTenantContext();

    if (!currentContext) {
      throw new Error(
        "No tenant context set - RLS will deny access. Ensure DatabaseContextInterceptor is properly configured."
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(currentContext)) {
      throw new Error(`Invalid tenant context format: ${currentContext}`);
    }

    return currentContext;
  }
}
