import { AuthEventsSubscriber } from "./auth-events.subscriber";
import { UserShadowRepository } from "../repositories/user-shadow.repository";
import { TEST_IDS } from "@app/shared/test-utils";

describe("AuthEventsSubscriber", () => {
  let subscriber: AuthEventsSubscriber;
  let shadowRepo: {
    upsert: jest.MockedFunction<UserShadowRepository["upsert"]>;
    deactivate: jest.MockedFunction<UserShadowRepository["deactivate"]>;
    updateRoles: jest.MockedFunction<UserShadowRepository["updateRoles"]>;
  };

  beforeEach(() => {
    shadowRepo = {
      upsert: jest.fn(),
      deactivate: jest.fn(),
      updateRoles: jest.fn(),
    };
    subscriber = new AuthEventsSubscriber(shadowRepo as unknown as UserShadowRepository);
  });

  it("handles USER_CREATED by upserting shadow", async () => {
    await subscriber.onUserCreated({
      eventId: "e1",
      tenantId: TEST_IDS.TENANT_A_ID,
      userId: TEST_IDS.REQUESTOR_USER_ID,
      email: "u@acme.com",
      firstName: "Bob",
      lastName: "Jones",
      roles: ["Requestor"],
      occurredAt: new Date().toISOString(),
    });
    expect(shadowRepo.upsert).toHaveBeenCalledTimes(1);
  });

  it("handles USER_DEACTIVATED by deactivating shadow", async () => {
    await subscriber.onUserDeactivated({
      eventId: "e2",
      tenantId: TEST_IDS.TENANT_A_ID,
      userId: TEST_IDS.REQUESTOR_USER_ID,
      occurredAt: new Date().toISOString(),
    });
    expect(shadowRepo.deactivate).toHaveBeenCalledTimes(1);
  });

  it("handles USER_ROLES_UPDATED by updating roles", async () => {
    await subscriber.onUserRolesUpdated({
      eventId: "e3",
      tenantId: TEST_IDS.TENANT_A_ID,
      userId: TEST_IDS.REQUESTOR_USER_ID,
      roles: ["Approver"],
      occurredAt: new Date().toISOString(),
    });
    expect(shadowRepo.updateRoles).toHaveBeenCalledTimes(1);
  });

  it("swallows repository errors", async () => {
    shadowRepo.upsert.mockRejectedValueOnce(new Error("boom"));
    await expect(
      subscriber.onUserCreated({
        eventId: "e4",
        tenantId: TEST_IDS.TENANT_A_ID,
        userId: TEST_IDS.REQUESTOR_USER_ID,
        email: "u@acme.com",
        firstName: "Bob",
        lastName: "Jones",
        roles: ["Requestor"],
        occurredAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });
});

