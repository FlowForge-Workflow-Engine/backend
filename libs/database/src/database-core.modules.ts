import { Global, Module } from "@nestjs/common";
import { DatabaseContextInterceptor } from "./interceptors/database-context.interceptor";
import { RequestContextService } from "./services/request-context.service";
import { RlsContextService } from "./services/rls-context.service";

@Global()
@Module({
  providers: [RequestContextService, RlsContextService, DatabaseContextInterceptor],
  exports: [RequestContextService, RlsContextService, DatabaseContextInterceptor],
})
export class DatabaseCoreModule {}
