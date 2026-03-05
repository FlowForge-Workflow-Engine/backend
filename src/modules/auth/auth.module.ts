import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { connect } from "nats";
import { USER_QUERY_CONTRACT } from "@app/shared/interfaces/contracts/user-query.contract";
import { NATS_CLIENT } from "../../infra";
import { TenantModule } from "../tenant/tenant.module";

// Entities
import { User } from "./entities/user.entity";
import { Role } from "./entities/role.entity";
import { Permission } from "./entities/permission.entity";
import { UserRole } from "./entities/user-role.entity";
import { RefreshToken } from "./entities/refresh-token.entity";

// Repositories
import { UserRepository } from "./repositories/user.repository";
import { RoleRepository } from "./repositories/role.repository";
import { RefreshTokenRepository } from "./repositories/refresh-token.repository";

// Services
import { AuthService } from "./services/auth.service";
import { UserService } from "./services/user.service";
import { UserQueryService } from "./services/user-query.service";
import { OnboardingService } from "./services/onboarding.service";

// Strategy & Guard
import { JwtStrategy } from "./strategies/jwt.strategy";

// Publisher
import { AuthPublisher } from "./publishers/auth.publisher";

// Controllers
import { AuthController } from "./controllers/auth.controller";
import { UserController } from "./controllers/user.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Permission, UserRole, RefreshToken]),
    TenantModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET", "change-me-in-env"),
        signOptions: {
          expiresIn: config.get<string>("JWT_EXPIRES_IN", "15m") as `${number}${"s" | "m" | "h" | "d"}`,
        },
      }),
    }),
  ],
  providers: [
    /**
     * Module-local NATS connection — same pattern as TenantModule.
     * Swappable for a global ClientProxy in Phase 5 with no publisher changes.
     */
    {
      provide: NATS_CLIENT,
      useFactory: async (configService: ConfigService) => {
        const natsUrl = configService.get<string>("NATS_URL", "nats://localhost:4222");
        return connect({ servers: [natsUrl] });
      },
      inject: [ConfigService],
    },

    // Repositories
    UserRepository,
    RoleRepository,
    RefreshTokenRepository,

    // Services (internal — NOT exported)
    AuthService,
    UserService,
    UserQueryService,
    OnboardingService,

    // Strategy
    JwtStrategy,

    // Publisher
    AuthPublisher,

    /** Contract binding — ONLY this token leaves the module boundary */
    { provide: USER_QUERY_CONTRACT, useClass: UserQueryService },
  ],
  controllers: [AuthController, UserController],
  exports: [USER_QUERY_CONTRACT],
})
export class AuthModule {}
