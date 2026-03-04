import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { config } from "dotenv";
import { join } from "path";
import { DataSource, DataSourceOptions } from "typeorm";

// FIXME: For AWS Secretmanager create a script to fetch the envs first to have migration capabilities
config({ path: join(__dirname, '..', '..', `.env.${process.env.STAGE}`) });


export function createOrmConfig(): DataSourceOptions & TypeOrmModuleOptions {
  const configService = new ConfigService();

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
    connectTimeoutMS: 10000,
    migrations: [join(__dirname, "..", "database", "migrations", "*{.ts,.js}")],
    //   cli: {
    //     migrationsDir: join(__dirname, "migrations"),
    //   },
    migrationsTableName: "migrations",
    migrationsRun: true,
    maxQueryExecutionTime: 1000,
    ...(configService.get<string>('STAGE') === 'dev'
      ? { logging: true, logger: 'file' }
      : { logging: false }),
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
