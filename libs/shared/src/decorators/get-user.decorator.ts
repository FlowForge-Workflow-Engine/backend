import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Decorator
 * Returns the current logged in user data
 */
export const GetUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  // req.user.password = undefined;
  return req.user;
});
