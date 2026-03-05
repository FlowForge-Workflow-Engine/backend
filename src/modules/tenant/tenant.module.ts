import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { connect } from "nats";
import { TENANT_QUERY_CONTRACT } from "@app/shared/interfaces/contracts/tenant-query.contract";
import { TENANT_PROVISIONING_CONTRACT } from "@app/shared/interfaces/contracts/tenant-provisioning.contract";
import { NATS_CLIENT } from "../../infra";
import { Tenant } from "./entities/tenant.entity";
import { TenantSettings } from "./entities/tenant-settings.entity";
import { TenantFeatureFlag } from "./entities/tenant-feature-flag.entity";
import { TenantRepository } from "./repositories/tenant.repository";
import { TenantSettingsRepository } from "./repositories/tenant-settings.repository";
import { TenantFeatureFlagRepository } from "./repositories/tenant-feature-flag.repository";
import { TenantService } from "./services/tenant.service";
import { TenantQueryService } from "./services/tenant-query.service";
import { TenantProvisioningService } from "./services/tenant-provisioning.service";
import { TenantPublisher } from "./publishers/tenant.publisher";
import { TenantController } from "./controllers/tenant.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantSettings, TenantFeatureFlag])],
  providers: [
    /**
     * Raw NATS connection provider. When @nestjs/microservices is wired in
     * app.module.ts (Phase 5), this module-level provider can be removed and
     * the global ClientProxy injected instead — TenantPublisher code unchanged.
     */
    {
      provide: NATS_CLIENT,
      useFactory: async (configService: ConfigService) => {
        const natsUrl = configService.get<string>("NATS_URL", "nats://localhost:4222");
        return connect({ servers: [natsUrl] });
      },
      inject: [ConfigService],
    },
    TenantRepository,
    TenantSettingsRepository,
    TenantFeatureFlagRepository,
    TenantService,
    TenantQueryService,
    TenantProvisioningService,
    TenantPublisher,
    /** Contract bindings — only these tokens leave the module boundary */
    { provide: TENANT_QUERY_CONTRACT, useClass: TenantQueryService },
    { provide: TENANT_PROVISIONING_CONTRACT, useClass: TenantProvisioningService },
  ],
  controllers: [TenantController],
  exports: [TENANT_QUERY_CONTRACT, TENANT_PROVISIONING_CONTRACT],
})
export class TenantModule {}
