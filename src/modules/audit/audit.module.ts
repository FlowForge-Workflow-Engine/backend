import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuditLog } from "./entities/audit-log.entity";
import { AuditLogRepository } from "./repositories/audit-log.repository";
import { AuditService } from "./services/audit.service";
import { AuditSubscriber } from "./subscribers/audit.subscriber";
import { AuditController } from "./controllers/audit.controller";

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditLogRepository, AuditService, AuditSubscriber],
  controllers: [AuditController, AuditSubscriber],
})
export class AuditModule {}
