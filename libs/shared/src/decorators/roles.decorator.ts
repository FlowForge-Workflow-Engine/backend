import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

/**
 * Defines which roles are allowed to access a route.
 * Works in conjunction with RolesGuard.
 *
 * @param roles - One or more role names (e.g. 'Admin', 'Approver')
 *
 * @example
 * ```typescript
 * @Roles('Admin')
 * @Get('admin-only')
 * adminEndpoint() { ... }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

