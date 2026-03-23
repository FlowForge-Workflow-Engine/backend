import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { WinstonModule } from "nest-winston";
import { ClassSerializerInterceptor } from "@nestjs/common";

import { AuthModule } from "./modules/auth/auth.module";
import { TenantModule } from "./modules/tenant/tenant.module";
import { AuditModule } from "./modules/audit/audit.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { RuleEngineModule } from "./modules/rule-engine/rule-engine.module";
import { WorkflowDefinitionModule } from "./modules/workflow-definition/workflow-definition.module";
import { WorkflowExecutionModule } from "./modules/workflow-execution/workflow-execution.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { PostgreSQLDatabaseModule } from "./modules/database/database.module";
import { HealthModule } from "./modules/health/health.module";

import { winstonLoggerConfig } from "./infra/configs/winston.config";
import { createNatsOptions, NATS_CLIENT } from "./infra/nats.config";
import { InfraModule } from "./infra/infra.module";
import { EnhancedRateLimitMiddleware } from "./infra/middlewares/enhanced-rate-limit.middleware";

import { JwtAuthGuard, TenantIsolationGuard, RolesGuard } from "@app/shared/guards";
import { GlobalExceptionFilter } from "@app/shared/filters";
import { LoggingInterceptor, TenantContextInterceptor } from "@app/shared/interceptors";
import { LoggerMiddleware } from "@app/shared/middlewares";
import { envSchema } from "@app/shared";
import { DatabaseContextInterceptor } from "@app/database/interceptors/database-context.interceptor";
import { ScheduleModule } from "@nestjs/schedule";
import { ClsModule } from "nestjs-cls";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [`.env.stage.${process.env.STAGE || "dev"}`, ".env"],
      isGlobal: true,
      validationSchema: envSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: +config.get<string>("THROTTLE_TTL"),
          limit: +config.get<string>("THROTTLE_LIMIT"),
        },
      ],
    }),
    // Global NATS ClientProxy — publishers across all modules inject NATS_CLIENT
    ClientsModule.registerAsync([
      {
        name: NATS_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.NATS,
          options: createNatsOptions(configService),
        }),
      },
    ]),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
      },
    }),
    ScheduleModule.forRoot(),
    WinstonModule.forRoot(winstonLoggerConfig),
    InfraModule,
    AuthModule,
    TenantModule,
    DashboardModule,
    WorkflowExecutionModule,
    WorkflowDefinitionModule,
    RuleEngineModule,
    AuditModule,
    NotificationModule,
    PostgreSQLDatabaseModule,
    HealthModule,
  ],
  controllers: [],
  providers: [
    // Rate limiting
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global auth guards (order matters: JWT → Tenant → Roles)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantIsolationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Global exception filter
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // Global interceptors
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: DatabaseContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes("/**");
    consumer
      .apply(EnhancedRateLimitMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.GET },
        { path: "health/ready", method: RequestMethod.GET }
      )
      .forRoutes("/**");
  }
}
