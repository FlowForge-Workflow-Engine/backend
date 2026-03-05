import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request, Response } from "express";
import { IJwtPayload } from "../interfaces/jwt-payload.interface";

/**
 * Structured JSON request/response logging interceptor.
 * Logs method, path, userId, tenantId, statusCode, and duration.
 * Does not log request/response bodies to avoid PII leakage.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  /**
   * @param context - Execution context
   * @param next - Call handler
   * @returns Observable continuing the request pipeline
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: IJwtPayload }>();
    const response = context.switchToHttp().getResponse<Response>();

    const { method, url } = request;
    const userId = request.user?.sub ?? "anonymous";
    const tenantId = request.user?.tenantId ?? "none";
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.logger.log(
            JSON.stringify({
              method,
              url,
              statusCode: response.statusCode,
              userId,
              tenantId,
              durationMs: duration,
            })
          );
        },
        error: (err: unknown) => {
          const duration = Date.now() - start;
          this.logger.error(
            JSON.stringify({
              method,
              url,
              statusCode: (err as { status?: number }).status ?? 500,
              userId,
              tenantId,
              durationMs: duration,
              error: err instanceof Error ? err.message : String(err),
            })
          );
        },
      })
    );
  }
}
