import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { IJwtPayload } from "../interfaces/jwt-payload.interface";

/**
 * Sets req.tenantId from the JWT payload for convenient downstream access.
 * Must run after JwtAuthGuard has populated req.user.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  /**
   * @param context - Execution context
   * @param next - Call handler
   * @returns Observable continuing the request pipeline
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: IJwtPayload; tenantId?: string }>();

    if (request.user?.tenantId) {
      request.tenantId = request.user.tenantId;
    }

    return next.handle();
  }
}
