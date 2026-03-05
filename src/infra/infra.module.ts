import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RedisService } from "./redis.service";

/**
 * Global infrastructure module.
 * Provides RedisService to every module in the application without needing to
 * re-import this module. Import once in AppModule.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class InfraModule {}
