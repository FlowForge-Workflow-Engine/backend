import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleAsyncOptions, TypeOrmModuleOptions } from "@nestjs/typeorm";
import { config } from "dotenv";
import { join } from "path";
import { DataSource, DataSourceOptions } from "typeorm";

function resolveStage(): string {
  if (process.env.STAGE) return process.env.STAGE;
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev") return "dev";
  if (process.env.NODE_ENV === "staging" || process.env.NODE_ENV === "staging") return "staging";
  if (process.env.NODE_ENV === "uat" || process.env.NODE_ENV === "uat") return "uat";
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "prod") return "prod";
  return process.env.NODE_ENV || "dev";
}

// Load the stage env file before Nest bootstraps ConfigModule so bootstrap migrations read env values.
config({ path: join(__dirname, "..", "..", "..", `.env.stage.${resolveStage()}`) });

function shouldUsePostgresEnv(configService: ConfigService): boolean {
  const stage = configService.get<string>("STAGE") || resolveStage();
  return stage === "uat" || stage === "prod";
}

export function createOrmConfig(configService?: ConfigService): DataSourceOptions & TypeOrmModuleOptions {
  if (!configService) configService = new ConfigService();
  const usePostgresEnv = shouldUsePostgresEnv(configService);
  const hostKey = usePostgresEnv ? "POSTGRES_HOST" : "DB_HOST";
  const portKey = usePostgresEnv ? "POSTGRES_PORT" : "DB_PORT";
  const userKey = usePostgresEnv ? "POSTGRES_USER" : "DB_USER";
  const passwordKey = usePostgresEnv ? "POSTGRES_PASSWORD" : "DB_PASSWORD";
  const databaseKey = usePostgresEnv ? "POSTGRES_DB" : "DATABASE";

  const isDev =
    configService.get<string>("NODE_ENV") === "development" ||
    configService.get<string>("NODE_ENV") === "dev";

  const ormconfig: DataSourceOptions & TypeOrmModuleOptions = {
    type: "postgres",
    host: configService.get<string>(hostKey),
    port: Number(configService.get<string>(portKey) || 5432),
    username: configService.get<string>(userKey),
    password: configService.get<string>(passwordKey),
    database: configService.get<string>(databaseKey),
    entities: [join(__dirname, "..", "..", "**", "**", "*.entity{.ts,.js}")],
    //   autoLoadEntities: true,
    synchronize: false,
    // dropSchema: true,
    retryAttempts: 1,
    retryDelay: 3000,
    connectTimeoutMS: 10000,
    maxQueryExecutionTime: 1000,
    migrations: [join(__dirname, "..", "..", "modules", "database", "migrations", "*{.ts,.js}")],

    //   cli: {
    //     migrationsDir: join(__dirname, "migrations"),
    //   },
    migrationsTableName: "migrations",
    migrationsRun: true,
    ...(isDev ? { logging: true, logger: "file" } : { logging: false }),
    ssl: usePostgresEnv ? { rejectUnauthorized: false } : false,
    extra: {
      // Connection pool settings
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    },
  };

  return ormconfig;
}

export function createDataSource() {
  return new DataSource(createOrmConfig());
}

// For Migrations
export const dataSource = createDataSource();

/**
 * Async options for TypeOrmModule.forRootAsync.
 * Import ConfigModule globally before using this.
 */
export const typeOrmModuleAsyncOptions: TypeOrmModuleAsyncOptions = {
  useFactory: (configService: ConfigService) => createOrmConfig(configService),
  inject: [ConfigService],
};
