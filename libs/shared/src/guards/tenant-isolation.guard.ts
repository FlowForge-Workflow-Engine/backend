import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { IJwtPayload } from "../interfaces/jwt-payload.interface";
import { AppErrors } from "../constants/app-errors.enum";

/**
 * Global tenant isolation guard.
 * Verifies that every authenticated request carries a tenantId in the JWT.
 * Skips public routes. Attaches req.tenantId for convenience.
 */
@Injectable()
export class TenantIsolationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * @param context - Execution context
   * @returns true if tenantId is present on the JWT payload
   */
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: IJwtPayload; tenantId?: string }>();

    if (!request.user?.tenantId) {
      throw new UnauthorizedException(AppErrors.TENANT_MISMATCH);
    }

    // Attach for convenience on downstream usage
    request.tenantId = request.user.tenantId;

    return true;
  }
}
