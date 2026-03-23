import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

import * as crypto from "crypto";
import { argon2hash, argon2verify } from "@app/shared/utils/hashes/argon2";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { generateUUID } from "@app/shared/utils/uuid.util";
import { sha256 } from "@app/shared/utils/hashes/hash";
import {
  TENANT_QUERY_CONTRACT,
  ITenantQueryContract,
} from "@app/shared/interfaces/contracts/tenant-query.contract";
import { UserRepository } from "../repositories/user.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { LoginDto } from "../dto/login.dto";
import { RequestContextService } from "@app/database";

/**
 * Represents the authentication token pair returned after successful login or refresh.
 * Contains both access token (short-lived JWT) and refresh token (long-lived opaque token).
 */
export interface AuthTokens {
  /** JWT access token for API authentication (short-lived, typically 15 minutes) */
  accessToken: string;
  /** Opaque refresh token for obtaining new token pairs (long-lived, typically 7 days) */
  refreshToken: string;
}

/**
 * Core authentication service handling login, logout, and token refresh flows.
 * Manages JWT access tokens and opaque refresh tokens with rotation on refresh.
 * Integrates with UserRepository for credential validation and RefreshTokenRepository for token lifecycle.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(TENANT_QUERY_CONTRACT)
    private readonly tenantQuery: ITenantQueryContract,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService
  ) {}

  /**
   * Authenticates a user with email and password credentials.
   * Validates credentials, loads user roles, updates lastLoginAt timestamp, and issues token pair.
   *
   * @param dto - Login credentials (email and password)
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @returns Promise<AuthTokens> - Access token and refresh token on successful authentication
   * @throws UnauthorizedException - If user not found, inactive, or password is invalid
   */
  async login(dto: LoginDto): Promise<AuthTokens> {
    const { tenantId, email, password } = dto;

    const user = await this.userRepository.findByEmailAndTenant(email, tenantId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordValid = await argon2verify(user.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Reload with roles for JWT payload
    const userWithRoles = await this.userRepository.findByIdWithRoles(user.id, tenantId);
    const roles = userWithRoles?.userRoles?.map((ur) => ur.role?.name).filter(Boolean) ?? [];
    const roleIds = userWithRoles?.userRoles?.map((ur) => ur.roleId).filter(Boolean) ?? [];

    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const tenant = await this.tenantQuery.findById(tenantId);

    return this.issueTokenPair(
      user.id,
      user.email,
      user.firstName,
      tenantId,
      tenant.slug,
      roles,
      roleIds,
      tenant.plan
    );
  }

  /**
   * Refreshes an expired access token using a valid refresh token.
   * Implements token rotation: revokes the consumed refresh token and issues a new pair.
   * Validates that the user is still active before issuing new tokens.
   *
   * @param rawRefreshToken - The opaque refresh token from the client
   * @returns Promise<AuthTokens> - New access token and refresh token
   * @throws UnauthorizedException - If refresh token is invalid, expired, or user is inactive
   */
  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = sha256(rawRefreshToken);
    const stored = await this.refreshTokenRepository.findByHash(tokenHash);

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    // ─────────────────────────────────────────────────────────────────────
    // At this point stored.tenantId is known for the first time.
    // The `DatabaseContextInterceptor` only set app.token_hash — no tenant_id was available
    // at request start. Now that we have it, set it on the existing CLS QR
    // so all subsequent queries (users, tenants) pass the uuidGuard policy.
    // This is intentional mid-request context enrichment, not a workaround.
    // ─────────────────────────────────────────────────────────────────────
    const qr = this.requestContext.getQueryRunner();
    // this.logger.debug("QR in CLS:", qr ? "yes" : "no", qr && !qr.isReleased ? " (active)" : "");

    if (qr && !qr.isReleased) {
      await qr.query(`SELECT set_config('app.tenant_id', $1::text, true)`, [stored.tenantId]);
      this.requestContext.setTenantId(stored.tenantId);

      this.logger.debug(`DB Context Updated → Refresh API: set app.tenant_id to ${stored.tenantId}`);
    }

    // Revoke the consumed token (rotation)
    await this.refreshTokenRepository.revoke(stored.id);

    const userWithRoles = await this.userRepository.findByIdWithRoles(stored.userId, stored.tenantId);
    if (!userWithRoles || !userWithRoles.isActive) {
      throw new UnauthorizedException("User not found or inactive");
    }

    const roles = userWithRoles.userRoles?.map((ur) => ur.role?.name).filter(Boolean) ?? [];
    const roleIds = userWithRoles.userRoles?.map((ur) => ur.roleId).filter(Boolean) ?? [];

    const tenant = await this.tenantQuery.findById(stored.tenantId);

    return this.issueTokenPair(
      stored.userId,
      userWithRoles.email,
      userWithRoles.firstName,
      stored.tenantId,
      tenant.slug,
      roles,
      roleIds,
      tenant.plan
    );
  }

  /**
   * Logs out a user by revoking their refresh token.
   * Gracefully handles cases where the token is already revoked or doesn't exist.
   *
   * @param rawRefreshToken - The opaque refresh token to revoke
   * @returns Promise<void>
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = sha256(rawRefreshToken);
    const stored = await this.refreshTokenRepository.findByHash(tokenHash);
    if (stored) {
      await this.refreshTokenRepository.revoke(stored.id);
    }
  }

  /**
   * Issues a new access token and refresh token pair.
   * Creates a JWT access token with user claims and stores a hashed refresh token in the database.
   * The refresh token is opaque to the client and used only for token rotation.
   *
   * @param userId - The user ID to include in the token payload
   * @param email - The user email to include in the token payload
   * @param firstName - The user first name to include in the token payload
   * @param tenantId - The tenant ID for multi-tenancy isolation
   * @param roles - Array of role names assigned to the user
   * @param roleIds - Array of role IDs assigned to the user
   * @returns Promise<AuthTokens> - Access token (JWT) and refresh token (opaque)
   */
  async issueTokenPair(
    userId: string,
    email: string,
    firstName: string,
    tenantId: string,
    tenantSlug: string,
    roles: string[],
    roleIds: string[],
    plan: string
  ): Promise<AuthTokens> {
    const payload: IJwtPayload = {
      sub: userId,
      email,
      firstName,
      tenantId,
      tenantSlug,
      roles,
      roleIds,
      plan,
    };

    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = generateUUID();
    const tokenHash = sha256(rawRefreshToken);
    const refreshExpiryDays = this.configService.get<number>("JWT_REFRESH_EXPIRY_DAYS", 7);
    const expiresAt = new Date(Date.now() + refreshExpiryDays * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepository.create({ tenantId, userId, tokenHash, expiresAt });

    this.logger.log(`Tokens issued for user=${userId}`);
    return { accessToken, refreshToken: rawRefreshToken };
  }
}
