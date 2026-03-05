import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

// Entities
import { NotificationTemplate } from "./entities/notification-template.entity";
import { NotificationLog } from "./entities/notification-log.entity";
import { WebhookConfig } from "./entities/webhook-config.entity";
import { WebhookDeliveryLog } from "./entities/webhook-delivery-log.entity";

// Repositories
import { NotificationTemplateRepository } from "./repositories/notification-template.repository";
import { NotificationLogRepository } from "./repositories/notification-log.repository";
import { WebhookConfigRepository } from "./repositories/webhook-config.repository";
import { WebhookDeliveryLogRepository } from "./repositories/webhook-delivery-log.repository";

// Services
import { NotificationService } from "./services/notification.service";
import { WebhookService } from "./services/webhook.service";

// Subscriber & Controllers
import { NotificationSubscriber } from "./subscribers/notification.subscriber";
import { NotificationTemplateController } from "./controllers/notification-template.controller";
import { WebhookConfigController } from "./controllers/webhook-config.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationTemplate, NotificationLog, WebhookConfig, WebhookDeliveryLog]),
  ],
  providers: [
    // Repositories
    NotificationTemplateRepository,
    NotificationLogRepository,
    WebhookConfigRepository,
    WebhookDeliveryLogRepository,
    // Services
    NotificationService,
    WebhookService,
    // Subscriber (also a @Controller for MessagePattern)
    NotificationSubscriber,
  ],
  controllers: [NotificationTemplateController, WebhookConfigController, NotificationSubscriber],
})
export class NotificationModule {}
