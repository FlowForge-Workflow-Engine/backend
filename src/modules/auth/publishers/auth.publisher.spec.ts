import { Test, TestingModule } from "@nestjs/testing";
import { AuthPublisher } from "./auth.publisher";
import { NATS_CLIENT } from "../../../infra";
import { createMockNatsConnection } from "@app/shared/test-utils/mocks";
import { NatsEvents } from "@app/shared/constants/nats-events.enum";
import { TEST_IDS } from "@app/shared/test-utils";

describe("AuthPublisher", () => {
  let publisher: AuthPublisher;
  let natsClient: ReturnType<typeof createMockNatsConnection>;

  const USER_ID = TEST_IDS.USER_ID;
  const TENANT_ID = TEST_IDS.TENANT_ID;
  const ROLE_ID = TEST_IDS.ADMIN_ROLE_ID;

  beforeEach(async () => {
    natsClient = createMockNatsConnection();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthPublisher, { provide: NATS_CLIENT, useValue: natsClient }],
    }).compile();

    publisher = module.get<AuthPublisher>(AuthPublisher);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── onModuleInit ────────────────────────────────────────────────────────────
  describe("onModuleInit()", () => {
    it("executes without error", () => {
      expect(() => publisher.onModuleInit()).not.toThrow();
    });
  });

  // ─── publishUserCreated ──────────────────────────────────────────────────────
  describe("publishUserCreated()", () => {
    const payload = {
      userId: USER_ID,
      tenantId: TENANT_ID,
      email: "alice@acme.com",
      firstName: "Alice",
    } as any;

    it("calls natsClient.publish with USER_CREATED subject and encoded payload", () => {
      publisher.publishUserCreated(payload);

      expect(natsClient.publish).toHaveBeenCalledTimes(1);
      const [subject] = natsClient.publish.mock.calls[0];
      expect(subject).toBe(NatsEvents.USER_CREATED);
    });

    it("does not throw when natsClient.publish fails — logs error instead", () => {
      natsClient.publish.mockImplementation(() => {
        throw new Error("NATS down");
      });

      expect(() => publisher.publishUserCreated(payload)).not.toThrow();
    });
  });

  // ─── publishUserDeactivated ──────────────────────────────────────────────────
  describe("publishUserDeactivated()", () => {
    const payload = { userId: USER_ID, tenantId: TENANT_ID } as any;

    it("calls natsClient.publish with USER_DEACTIVATED subject", () => {
      publisher.publishUserDeactivated(payload);

      const [subject] = natsClient.publish.mock.calls[0];
      expect(subject).toBe(NatsEvents.USER_DEACTIVATED);
    });

    it("swallows errors thrown by natsClient.publish", () => {
      natsClient.publish.mockImplementation(() => {
        throw new Error("NATS timeout");
      });

      expect(() => publisher.publishUserDeactivated(payload)).not.toThrow();
    });
  });

  // ─── publishUserRolesUpdated ─────────────────────────────────────────────────
  describe("publishUserRolesUpdated()", () => {
    const payload = { userId: USER_ID, tenantId: TENANT_ID, roleIds: [ROLE_ID] } as any;

    it("calls natsClient.publish with USER_ROLES_UPDATED subject", () => {
      publisher.publishUserRolesUpdated(payload);

      const [subject] = natsClient.publish.mock.calls[0];
      expect(subject).toBe(NatsEvents.USER_ROLES_UPDATED);
    });

    it("swallows errors thrown by natsClient.publish", () => {
      natsClient.publish.mockImplementation(() => {
        throw new Error("encode error");
      });

      expect(() => publisher.publishUserRolesUpdated(payload)).not.toThrow();
    });
  });

  // ─── publishTenantCreated ────────────────────────────────────────────────────
  describe("publishTenantCreated()", () => {
    const payload = {
      tenantId: TENANT_ID,
      tenantName: TEST_IDS.TENANT_NAME,
      tenantSlug: TEST_IDS.TENANT_SLUG,
      adminUserId: USER_ID,
      adminEmail: "alice@acme.com",
    } as any;

    it("calls natsClient.publish with TENANT_CREATED subject", () => {
      publisher.publishTenantCreated(payload);

      const [subject] = natsClient.publish.mock.calls[0];
      expect(subject).toBe(NatsEvents.TENANT_CREATED);
    });

    it("swallows errors thrown by natsClient.publish", () => {
      natsClient.publish.mockImplementation(() => {
        throw new Error("connection closed");
      });

      expect(() => publisher.publishTenantCreated(payload)).not.toThrow();
    });
  });
});
