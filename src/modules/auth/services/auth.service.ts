import { Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

import * as crypto from "crypto";
import { argon2hash, argon2verify } from "@app/shared/utils/hashes/argon2";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { generateUUID } from "@app/shared/utils/uuid.util";
import { UserRepository } from "../repositories/user.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { LoginDto } from "../dto/login.dto";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async login(dto: LoginDto, tenantId: string): Promise<AuthTokens> {
    const user = await this.userRepository.findByEmailAndTenant(dto.email, tenantId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordValid = await argon2verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Reload with roles for JWT payload
    const userWithRoles = await this.userRepository.findByIdWithRoles(user.id, tenantId);
    const roles = userWithRoles?.userRoles?.map((ur) => ur.role?.name).filter(Boolean) ?? [];

    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    return this.issueTokens(user.id, user.email, user.firstName, tenantId, roles);
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenRepository.findByHash(tokenHash);

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    // Revoke the consumed token (rotation)
    await this.refreshTokenRepository.revoke(stored.id);

    const userWithRoles = await this.userRepository.findByIdWithRoles(stored.userId, stored.tenantId);
    if (!userWithRoles || !userWithRoles.isActive) {
      throw new UnauthorizedException("User not found or inactive");
    }

    const roles = userWithRoles.userRoles?.map((ur) => ur.role?.name).filter(Boolean) ?? [];

    return this.issueTokens(
      stored.userId,
      userWithRoles.email,
      userWithRoles.firstName,
      stored.tenantId,
      roles
    );
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.refreshTokenRepository.findByHash(tokenHash);
    if (stored) {
      await this.refreshTokenRepository.revoke(stored.id);
    }
  }

  private async issueTokens(
    userId: string,
    email: string,
    firstName: string,
    tenantId: string,
    roles: string[]
  ): Promise<AuthTokens> {
    const payload: IJwtPayload = {
      sub: userId,
      email,
      firstName,
      tenantId,
      tenantSlug: "", // populated by middleware in future phase
      roles,
      plan: "", // populated by TenantQueryContract in future phase
    };

    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = generateUUID();
    const tokenHash = this.hashToken(rawRefreshToken);
    const refreshExpiryDays = this.configService.get<number>("JWT_REFRESH_EXPIRY_DAYS", 7);
    const expiresAt = new Date(Date.now() + refreshExpiryDays * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepository.create({ tenantId, userId, tokenHash, expiresAt });

    this.logger.log(`Tokens issued for user=${userId}`);
    return { accessToken, refreshToken: rawRefreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
