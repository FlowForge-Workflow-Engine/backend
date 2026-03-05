import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Stub guard for the local (username/password) strategy.
 * Currently unused — login is handled directly by AuthService.login()
 * without a separate LocalStrategy, keeping the controller explicit.
 *
 * Kept as a named export so it can be applied if a LocalStrategy is added
 * in a future phase without changing the controller decorator.
 */
@Injectable()
export class LocalGuard extends AuthGuard("local") {}
