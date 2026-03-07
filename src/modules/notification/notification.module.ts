import { Module } from "@nestjs/common";
import { MailerModule } from "@nestjs-modules/mailer";
import { PugAdapter } from "@nestjs-modules/mailer/dist/adapters/pug.adapter";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT } from "@app/shared/interfaces/contracts/notification-template-bootstrap.contract";
import { join } from "path";

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
import { NotificationTemplateBootstrapService } from "./services/notification-template-bootstrap.service";
import { WebhookService } from "./services/webhook.service";

// Subscriber & Controllers
import { NotificationSubscriber } from "./subscribers/notification.subscriber";
import { NotificationTemplateController } from "./controllers/notification-template.controller";
import { WebhookConfigController } from "./controllers/webhook-config.controller";

@Module({
  imports: [
    ConfigModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host =
          configService.get<string>("EMAIL_HOST") ??
          configService.get<string>("SMTP_HOST", "smtp.mailtrap.io");
        const port = Number(
          configService.get<string>("EMAIL_PORT") ?? configService.get<string>("SMTP_PORT") ?? "2525"
        );
        const user = configService.get<string>("EMAIL_USERNAME") ?? configService.get<string>("SMTP_USER");
        const pass = configService.get<string>("EMAIL_PASSWORD") ?? configService.get<string>("SMTP_PASS");
        const from =
          configService.get<string>("EMAIL_FROM") ??
          configService.get<string>("SMTP_FROM", "noreply@workflow-engine.com");
        const secure = String(configService.get<string>("SMTP_SECURE", "false")).toLowerCase() === "true";

        return {
          transport: {
            host,
            port,
            secure,
            auth: user ? { user, pass } : undefined,
          },
          defaults: {
            from,
          },
          template: {
            // Read Pug templates from the source tree so notification rendering works without extra asset-copy wiring.
            dir: join(process.cwd(), "src", "modules", "notification", "templates"),
            adapter: new PugAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
    }),
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
    NotificationTemplateBootstrapService,
    WebhookService,
    // Subscriber (also a @Controller for EventPattern)
    NotificationSubscriber,
    /** Contract binding — only this bootstrap token leaves the module boundary */
    { provide: NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT, useClass: NotificationTemplateBootstrapService },
  ],
  controllers: [NotificationTemplateController, WebhookConfigController, NotificationSubscriber],
  exports: [NOTIFICATION_TEMPLATE_BOOTSTRAP_CONTRACT],
})
export class NotificationModule {}
