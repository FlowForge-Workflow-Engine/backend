import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleAsyncOptions, TypeOrmModuleOptions } from "@nestjs/typeorm";
import { join } from "path";

/**
 * Builds TypeORM module options from ConfigService.
 * Uses DATABASE_URL for the connection string.
 * All entities are auto-loaded from the TypeORM entity registry (autoLoadEntities: true).
 * Migrations are managed separately via migration-runner.ts and the CLI data-source.
 *
 * @param configService - NestJS ConfigService instance
 * @returns TypeORM module options
 */
export function createTypeOrmConfig(configService: ConfigService): TypeOrmModuleOptions {
  const isDev = configService.get<string>("NODE_ENV") === "development";

  return {
    type: "postgres",
    // url: configService.get<string>("DATABASE_URL"),
    host: configService.get<string>("DB_HOST"),
    port: +configService.get<string>("DB_PORT"),
    username: configService.get<string>("DB_USER"),
    password: configService.get<string>("DB_PASSWORD"),
    database: configService.get<string>("DATABASE"),
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: false,
    retryAttempts: 3,
    retryDelay: 3000,
    connectTimeoutMS: 10_000,
    maxQueryExecutionTime: 2_000,
    migrations: [join(__dirname, "..", "..", "database", "migrations", "*{.ts,.js}")],
    migrationsTableName: "typeorm_migrations",
    logging: isDev ? ["query", "error", "schema", "migration"] : ["error", "migration"],
    logger: isDev ? "file" : "simple-console",
    extra: {
      // Connection pool settings
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    },
  };
}

/**
 * Async options for TypeOrmModule.forRootAsync.
 * Import ConfigModule globally before using this.
 */
export const typeOrmModuleAsyncOptions: TypeOrmModuleAsyncOptions = {
  useFactory: (configService: ConfigService) => createTypeOrmConfig(configService),
  inject: [ConfigService],
};
