import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route as public — skips the global JwtAuthGuard.
 * Use on endpoints like /auth/login, /auth/refresh, /health.
 *
 * @example
 * ```typescript
 * @Public()
 * @Post('login')
 * login() { ... }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
