import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { createOrmConfig } from "./ormconfig";

/**
 * It is a feature module where we keep code related to database. we import the typeorm module and configure it to work with any database.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: async () => createOrmConfig(),
    }),
  ],
})
export class PostgreSQLDatabaseModule {}
