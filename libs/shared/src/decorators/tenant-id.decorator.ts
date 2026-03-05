import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { IJwtPayload } from "../interfaces/jwt-payload.interface";

/**
 * Extracts tenantId from the JWT payload on the request.
 * Never trusts tenantId from request body or query params.
 *
 * @example
 * ```typescript
 * async myEndpoint(@TenantId() tenantId: string) { ... }
 * ```
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{ user: IJwtPayload }>();
  return request.user.tenantId;
});
