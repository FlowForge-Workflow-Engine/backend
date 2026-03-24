import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from "@nestjs/common";
import { from, Observable } from "rxjs";
import { catchError, finalize, switchMap, tap } from "rxjs/operators";
import { IJwtPayload } from "../../../../libs/shared/src/interfaces/jwt-payload.interface";
import { RlsContextService } from "../services/rls-context.service";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "@app/shared/decorators/public.decorator";

/**
 * DatabaseContextInterceptor - Sets PostgreSQL session context for Row-Level Security (RLS)
 *
 * This interceptor is CRITICAL for multi-tenant security. It sets the tenant_id in the
 * PostgreSQL session context BEFORE any database queries execute, enabling RLS policies
 * to automatically filter data by tenant.
 *
 * ============================================================================
 * HOW IT WORKS:
 * ============================================================================
 *
 * 1. Extracts tenant_id from JWT payload (req.user.tenantId)
 * 2. Uses RlsContextService to set PostgreSQL session context
 * 3. RLS policies use this context to filter all subsequent queries
 * 4. Context is automatically cleared after request completion
 *
 * ============================================================================
 * SECURITY GUARANTEES:
 * ============================================================================
 *
 * ✓ Database-Level Isolation: Even if application code forgets WHERE tenant_id,
 *   PostgreSQL RLS automatically adds the filter
 *
 * ✓ SQL Injection Protection: RLS policies cannot be bypassed by malicious SQL
 *
 * ✓ Fail-Secure: If context not set, RLS denies ALL access (safe default)
 *
 * ============================================================================
 * USAGE:
 * ============================================================================
 *
 * Apply globally in AppModule:
 * ```typescript
 * {
 *   provide: APP_INTERCEPTOR,
 *   useClass: DatabaseContextInterceptor,
 * }
 * ```
 *
 * Must run AFTER JwtAuthGuard populates req.user but BEFORE any database queries.
 */

interface RequestWithTenant {
  user?: IJwtPayload;
  body?: { tenantSlug?: string; tenantId?: string; refreshToken?: string };
  params?: { tenantSlug?: string };
  query?: { tenantSlug?: string };
}

@Injectable()
export class DatabaseContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DatabaseContextInterceptor.name);

  constructor(
    private readonly rlsContextService: RlsContextService,
    private readonly reflector: Reflector
  ) {}

  /**
   * Sets PostgreSQL session context for RLS before request processing
   */
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Extract tenant ID from JWT payload
    const tenantId = isPublic ? request.body?.tenantId : request.user?.tenantId;
    const tenantSlug = request.body?.tenantSlug || request.query?.tenantSlug;
    const refreshToken = request.body?.refreshToken;

    let requestFailed = false;

    return from(this.rlsContextService.setTenantContext(tenantId, tenantSlug, refreshToken, isPublic)).pipe(
      switchMap(() => next.handle()),
      catchError((err) => {
        requestFailed = true;
        throw err; // rethrow — NestJS exception filters handle the response
      }),
      finalize(async () => {
        const qr = this.rlsContextService.getTenantContext();
        if (!qr || qr.isReleased) return;

        try {
          if (qr.isTransactionActive) {
            if (requestFailed) {
              await qr.rollbackTransaction();
            } else {
              await qr.commitTransaction();
            }
          }
        } catch (err) {
          this.logger.error("Failed to commit/rollback transaction:", err.message);
        } finally {
          await qr.release(); // always release — returns connection to pool clean
        }

        this.logger.debug(
          `QR released — tx ${requestFailed ? "rolled back" : "committed"}, RLS context cleared`
        );
        console.log("=".repeat(150));
      })
    );

    // return from(this.rlsContextService.setTenantContext(tenantId, tenantSlug, refreshToken, isPublic)).pipe(
    //   switchMap(() => {
    //     // Capture QR reference HERE — while AsyncLocalStorage context is still alive
    //     const qr = this.rlsContextService.getTenantContext();

    //     return next.handle().pipe(
    //       switchMap(async (responseData) => {
    //         if (qr && !qr.isReleased && qr.isTransactionActive) {
    //           // console.log("COMMITING TRANSACTION");
    //           await qr.commitTransaction();
    //         }
    //         // console.log("RELEASING QR (success)");
    //         await qr.release();
    //         this.logger.debug(`QR released — tx committed, RLS context cleared`);
    //         console.log("=".repeat(150));
    //         return responseData;
    //       }),

    //       catchError(async (err) => {
    //         if (qr && !qr.isReleased && qr.isTransactionActive) {
    //           // console.log("ROLLING BACK TRANSACTION");
    //           await qr.rollbackTransaction();
    //         }
    //         if (qr && !qr.isReleased) {
    //           // console.log("RELEASING QR (error)");
    //           await qr.release();
    //           this.logger.debug(`QR released — tx rolled back, RLS context cleared`);
    //           console.log("=".repeat(150));
    //         }
    //         throw err;
    //       })
    //     );
    //   })
    // );
  }
}
