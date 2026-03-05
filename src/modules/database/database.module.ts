import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { createOrmConfig } from "./ormconfig";
import { RlsContextService } from "./services/rls-context.service";
import { DatabaseContextInterceptor } from "./interceptors/database-context.interceptor";

/**
 * DatabaseModule wires TypeORM to PostgreSQL using the centralised infra config.
 * Configuration is read from ConfigService (DATABASE_URL + NODE_ENV).
 * All entities are auto-loaded via TypeORM's entity registry (autoLoadEntities: true).
 *
 * Also provides RLS (Row-Level Security) services for multi-tenant data isolation.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => createOrmConfig(configService),
      inject: [ConfigService],
    }),
  ],
  providers: [RlsContextService, DatabaseContextInterceptor],
  exports: [RlsContextService, DatabaseContextInterceptor],
})
export class PostgreSQLDatabaseModule {}
