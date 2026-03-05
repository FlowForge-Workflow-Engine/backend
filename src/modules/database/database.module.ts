import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { createTypeOrmConfig } from "../../infra/typeorm.config";

/**
 * DatabaseModule wires TypeORM to PostgreSQL using the centralised infra config.
 * Configuration is read from ConfigService (DATABASE_URL + NODE_ENV).
 * All entities are auto-loaded via TypeORM's entity registry (autoLoadEntities: true).
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => createTypeOrmConfig(configService),
      inject: [ConfigService],
    }),
  ],
})
export class PostgreSQLDatabaseModule {}
