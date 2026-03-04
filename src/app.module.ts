import { MiddlewareConsumer, Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { TenantModule } from "./modules/tenant/tenant.module";
import { AuditModule } from "./modules/audit/audit.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { RuleEngineModule } from "./modules/rule-engine/rule-engine.module";
import { WorkflowDefinitionModule } from "./modules/workflow-definition/workflow-definition.module";
import { WorkflowExecutionModule } from "./modules/workflow-execution/workflow-execution.module";
import { PostgreSQLDatabaseModule } from "./modules/database/database.module";
import { HealthModule } from "./modules/health/health.module";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { WinstonModule } from "nest-winston";
import { winstonLoggerConfig } from "./infra/configs/winston.config";
import { LoggerMiddleware } from "@app/shared/middlewares";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [`.env.stage.${process.env.STAGE}`],
      isGlobal: true,
      // validationSchema: envSchema,
      // validationOptions: { allowUnknown: false, abortEarly: true },
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
    WinstonModule.forRoot(winstonLoggerConfig),
    AuthModule,
    TenantModule,
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
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes("/**");
  }
}
