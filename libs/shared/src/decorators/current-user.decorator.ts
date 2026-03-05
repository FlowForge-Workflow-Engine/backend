import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { IJwtPayload } from "../interfaces/jwt-payload.interface";

/**
 * Extracts the authenticated user from the request as IJwtPayload.
 * Zero DB call — data comes entirely from the JWT claims.
 *
 * @example
 * ```typescript
 * async myEndpoint(@CurrentUser() user: IJwtPayload) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IJwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: IJwtPayload }>();
    return request.user;
  },
);

