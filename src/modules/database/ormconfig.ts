import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleAsyncOptions, TypeOrmModuleOptions } from "@nestjs/typeorm";
import { config } from "dotenv";
import { join } from "path";
import { DataSource, DataSourceOptions } from "typeorm";

// FIXME: For AWS Secretmanager create a script to fetch the envs first to have migration capabilities
config({ path: join(__dirname, "..", "..", "..", `.env.stage.${process.env.STAGE}`) });

export function createOrmConfig(configService?: ConfigService): DataSourceOptions & TypeOrmModuleOptions {
  if (!configService) configService = new ConfigService();

  const isDev =
    configService.get<string>("NODE_ENV") === "development" ||
    configService.get<string>("NODE_ENV") === "dev";

  const ormconfig: DataSourceOptions & TypeOrmModuleOptions = {
    type: "postgres",
    host: configService.get<string>("DB_HOST"),
    port: +configService.get<string>("DB_PORT"),
    username: configService.get<string>("DB_USER"),
    password: configService.get<string>("DB_PASSWORD"),
    database: configService.get<string>("DATABASE"),
    entities: [join(__dirname, "..", "**", "**", "*.entity{.ts,.js}")],
    //   autoLoadEntities: true,
    synchronize: false,
    // dropSchema: true,
    retryAttempts: 1,
    retryDelay: 3000,
    connectTimeoutMS: 10000,
    maxQueryExecutionTime: 1000,
    migrations: [join(__dirname, "..", "database", "migrations", "*{.ts,.js}")],
    //   cli: {
    //     migrationsDir: join(__dirname, "migrations"),
    //   },
    migrationsTableName: "migrations",
    migrationsRun: true,
    ...(isDev ? { logging: true, logger: "file" } : { logging: false }),
    extra: {
      // Connection pool settings
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    },
    // ssl: false,
    // extra: {
    //   ssl: {
    //     rejectUnauthorized: false,
    //   },
    // },
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
