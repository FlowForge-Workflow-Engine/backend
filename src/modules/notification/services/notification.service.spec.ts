import { MailerService } from "@nestjs-modules/mailer";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { NotificationService } from "./notification.service";
import { NotificationLogRepository } from "../repositories/notification-log.repository";
import { NotificationStatus } from "../entities/notification-log.entity";
import { NotificationChannel, NotificationTemplate } from "../entities/notification-template.entity";
import { NotificationEventTrigger } from "../constants/notification-event-trigger.enum";
import { TEST_IDS } from "@app/shared/test-utils";

describe("NotificationService", () => {
  let service: NotificationService;
  let notificationLogRepository: {
    insert: jest.MockedFunction<NotificationLogRepository["insert"]>;
    updateStatus: jest.MockedFunction<NotificationLogRepository["updateStatus"]>;
  };
  let configService: { get: jest.Mock };
  let mailerService: { sendMail: jest.Mock };

  beforeEach(async () => {
    notificationLogRepository = {
      insert: jest.fn(),
      updateStatus: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === "EMAIL_FROM") return "noreply@test.com";
        return fallback;
      }),
    };
    mailerService = { sendMail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: NotificationLogRepository, useValue: notificationLogRepository },
        { provide: ConfigService, useValue: configService },
        { provide: MailerService, useValue: mailerService },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it("sendEmail sends email and marks log as SENT", async () => {
    const template: NotificationTemplate = {
      id: TEST_IDS.NOTIFICATION_TEMPLATE_ID,
      tenantId: TEST_IDS.TENANT_A_ID,
      eventTrigger: NotificationEventTrigger.WORKFLOW_TRANSITION_COMPLETED,
      channel: NotificationChannel.EMAIL,
      subjectTemplate: "Leave approved for {{employeeName}}",
      bodyTemplate: "leave-approved",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    notificationLogRepository.insert.mockResolvedValue({
      id: "log-1",
    } as never);
    mailerService.sendMail.mockResolvedValue({ messageId: "m1" });
    notificationLogRepository.updateStatus.mockResolvedValue(undefined);

    await service.sendEmail(
      template,
      "bob@acme.com",
      TEST_IDS.REQUESTOR_USER_ID,
      TEST_IDS.TENANT_A_ID,
      { employeeName: "Bob" }
    );

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "bob@acme.com",
        from: "noreply@test.com",
        subject: "Leave approved for Bob",
        template: "leave-approved",
      })
    );
    expect(notificationLogRepository.updateStatus).toHaveBeenCalledWith(
      "log-1",
      TEST_IDS.TENANT_A_ID,
      NotificationStatus.SENT,
      expect.any(Date)
    );
  });

  it("sendEmail marks log as FAILED when mailer throws", async () => {
    const template: NotificationTemplate = {
      id: TEST_IDS.NOTIFICATION_TEMPLATE_ID,
      tenantId: TEST_IDS.TENANT_A_ID,
      eventTrigger: NotificationEventTrigger.WORKFLOW_TRANSITION_COMPLETED,
      channel: NotificationChannel.EMAIL,
      subjectTemplate: "Subj",
      bodyTemplate: "leave-approved.pug",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    notificationLogRepository.insert.mockResolvedValue({ id: "log-2" } as never);
    mailerService.sendMail.mockRejectedValue(new Error("smtp down"));
    notificationLogRepository.updateStatus.mockResolvedValue(undefined);

    await service.sendEmail(template, "bob@acme.com", null, TEST_IDS.TENANT_A_ID, {});

    expect(notificationLogRepository.updateStatus).toHaveBeenCalledWith(
      "log-2",
      TEST_IDS.TENANT_A_ID,
      NotificationStatus.FAILED,
      undefined,
      "smtp down"
    );
  });
});

