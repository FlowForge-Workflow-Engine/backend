/**
 * Unit Tests: AuditSubscriber
 * Module: audit
 * Coverage target: 85%+ line and branch
 *
 * Mocks used:
 * - AuditLogRepository.insertIfAbsent() for idempotent persistence
 * - Logger spies to validate swallow-on-error + idempotency no-op path
 *
 * NOTE: This file ONLY contains test code. No production code is modified.
 */
import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditActionType } from "../enum/audit-action-type.enum";
import { AuditSubscriber } from "./audit.subscriber";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import { TEST_IDS, mockAdminJwt, mockApproverJwt, mockRequestorJwt } from "@app/shared/test-utils";
import {
  IUserCreatedEvent,
  IUserDeactivatedEvent,
  IUserRolesUpdatedEvent,
} from "@app/shared/interfaces/events/auth-events.interface";
import {
  ITenantCreatedEvent,
  ITenantDeactivatedEvent,
  ITenantPlanUpdatedEvent,
} from "@app/shared/interfaces/events/tenant-events.interface";
import {
  IWorkflowDefinitionDeprecatedEvent,
  IWorkflowDefinitionPublishedEvent,
  IWorkflowInstanceCancelledEvent,
  IWorkflowInstanceCompletedEvent,
  IWorkflowInstanceCreatedEvent,
  IWorkflowTransitionCompletedEvent,
} from "@app/shared/interfaces/events/workflow-events.interface";
import { AuditLog } from "../entities/audit-log.entity";

describe("AuditSubscriber", () => {
  let subscriber: AuditSubscriber;
  let repo: {
    insertIfAbsent: jest.MockedFunction<AuditLogRepository["insertIfAbsent"]>;
  };

  let logger: Logger;

  const tenantId = TEST_IDS.TENANT_A_ID;
  const userId = TEST_IDS.ADMIN_USER_ID;
  const instanceId = TEST_IDS.INSTANCE_ID;
  const definitionId = TEST_IDS.WORKFLOW_DEFINITION_ID;
  const transitionId = TEST_IDS.TRANSITION_ID;
  const eventId = TEST_IDS.EVENT_ID;

  beforeEach(async () => {
    repo = {
      insertIfAbsent: jest.fn(),
    };

    repo.insertIfAbsent.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditSubscriber,
        { provide: AuditLogRepository, useValue: repo },
      ],
    }).compile();

    subscriber = module.get<AuditSubscriber>(AuditSubscriber);

    logger = (subscriber as unknown as { logger: Logger }).logger;
    jest.spyOn(logger, "log").mockImplementation(() => void 0);
    jest.spyOn(logger, "error").mockImplementation(() => void 0);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function expectEntry(callIndex: number, expected: Partial<AuditLog>): void {
    const entry = repo.insertIfAbsent.mock.calls[callIndex][2] as Partial<AuditLog>;
    expect(entry).toEqual(expect.objectContaining(expected));
  }

  describe("idempotency + swallow behavior", () => {
    it("does not emit Logger.log when insertIfAbsent returns false", async () => {
      const payload: IUserCreatedEvent = {
        eventId,
        tenantId,
        userId,
        email: mockAdminJwt.email,
        firstName: mockAdminJwt.firstName,
        lastName: "Doe",
        roles: mockAdminJwt.roles,
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      repo.insertIfAbsent.mockResolvedValueOnce(false);

      await expect(subscriber.onUserCreated(payload)).resolves.toBeUndefined();

      expect(repo.insertIfAbsent).toHaveBeenCalledWith(eventId, tenantId, expect.any(Object));
      expect(logger.log).not.toHaveBeenCalled();
    });

    it("swallows repository errors and logs Logger.error instead of throwing", async () => {
      const payload: ITenantDeactivatedEvent = {
        eventId,
        tenantId,
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      repo.insertIfAbsent.mockRejectedValueOnce(new Error("db down"));

      await expect(subscriber.onTenantDeactivated(payload)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("event handlers map payload into AuditLog entries", () => {
    it("onUserCreated() persists USER_CREATED with null actor fields", async () => {
      const payload: IUserCreatedEvent = {
        eventId,
        tenantId,
        userId,
        email: mockAdminJwt.email,
        firstName: mockAdminJwt.firstName,
        lastName: "Doe",
        roles: mockAdminJwt.roles,
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onUserCreated(payload);

      expect(repo.insertIfAbsent).toHaveBeenCalledWith(eventId, tenantId, expect.any(Object));
      expectEntry(0, {
        tenantId,
        instanceId: null,
        actorId: null,
        actorEmail: null,
        actorRole: null,
        actionType: AuditActionType.USER_CREATED,
        transitionId: null,
        transitionName: null,
        fromState: null,
        toState: null,
        resourceType: "user",
        resourceId: userId,
        eventId,
      });
      expectEntry(0, {
        occurredAt: new Date(payload.occurredAt),
        payload: expect.objectContaining({ eventId: payload.eventId }),
      });
    });

    it("onUserDeactivated() persists USER_DEACTIVATED", async () => {
      const payload: IUserDeactivatedEvent = {
        eventId,
        tenantId,
        userId,
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onUserDeactivated(payload);

      expectEntry(0, {
        actionType: AuditActionType.USER_DEACTIVATED,
        resourceType: "user",
        resourceId: userId,
        instanceId: null,
        transitionId: null,
        transitionName: null,
      });
    });

    it("onUserRolesUpdated() persists USER_ROLES_UPDATED", async () => {
      const payload: IUserRolesUpdatedEvent = {
        eventId,
        tenantId,
        userId,
        roles: mockAdminJwt.roles,
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onUserRolesUpdated(payload);

      expectEntry(0, {
        actionType: AuditActionType.USER_ROLES_UPDATED,
        resourceType: "user",
        resourceId: userId,
      });
    });

    it("onTenantCreated() persists TENANT_CREATED", async () => {
      const payload: ITenantCreatedEvent = {
        eventId,
        tenantId,
        name: "Acme Corp",
        slug: "acme-corp",
        plan: "pro",
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onTenantCreated(payload);

      expectEntry(0, {
        actionType: AuditActionType.TENANT_CREATED,
        resourceType: "tenant",
        resourceId: tenantId,
        instanceId: null,
        transitionId: null,
        transitionName: null,
      });
    });

    it("onTenantDeactivated() persists TENANT_DEACTIVATED", async () => {
      const payload: ITenantDeactivatedEvent = {
        eventId,
        tenantId,
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onTenantDeactivated(payload);

      expectEntry(0, {
        actionType: AuditActionType.TENANT_DEACTIVATED,
        resourceType: "tenant",
        resourceId: tenantId,
      });
    });

    it("onTenantPlanUpdated() persists TENANT_PLAN_UPDATED", async () => {
      const payload: ITenantPlanUpdatedEvent = {
        eventId,
        tenantId,
        oldPlan: "free",
        newPlan: "pro",
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onTenantPlanUpdated(payload);

      expectEntry(0, {
        actionType: AuditActionType.TENANT_PLAN_UPDATED,
        resourceType: "tenant",
        resourceId: tenantId,
      });
    });

    it("onWorkflowDefinitionPublished() persists WORKFLOW_DEFINITION_PUBLISHED with actor snapshots", async () => {
      const payload: IWorkflowDefinitionPublishedEvent = {
        eventId,
        tenantId,
        definitionId,
        versionNumber: 1,
        publishedByUserId: mockAdminJwt.sub,
        publishedByEmail: mockAdminJwt.email,
        publishedByRole: mockAdminJwt.roles[0],
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onWorkflowDefinitionPublished(payload);

      expectEntry(0, {
        actionType: AuditActionType.WORKFLOW_DEFINITION_PUBLISHED,
        resourceType: "workflow_definition",
        resourceId: definitionId,
        actorId: payload.publishedByUserId,
        actorEmail: payload.publishedByEmail,
        actorRole: payload.publishedByRole,
        transitionId: null,
        transitionName: null,
        fromState: null,
        toState: null,
      });
    });

    it("onWorkflowDefinitionDeprecated() persists WORKFLOW_DEFINITION_DEPRECATED", async () => {
      const payload: IWorkflowDefinitionDeprecatedEvent = {
        eventId,
        tenantId,
        definitionId,
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onWorkflowDefinitionDeprecated(payload);

      expectEntry(0, {
        actionType: AuditActionType.WORKFLOW_DEFINITION_DEPRECATED,
        resourceType: "workflow_definition",
        resourceId: definitionId,
      });
    });

    it("onInstanceCreated() persists INSTANCE_CREATED with toState=initialState", async () => {
      const payload: IWorkflowInstanceCreatedEvent = {
        eventId,
        tenantId,
        instanceId,
        performedByUserId: mockRequestorJwt.sub,
        performedByEmail: mockRequestorJwt.email,
        performedByRole: mockRequestorJwt.roles[0],
        workflowDefinitionId: definitionId,
        initialState: "Applied",
        createdByUserId: mockRequestorJwt.sub,
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onInstanceCreated(payload);

      expectEntry(0, {
        actionType: AuditActionType.INSTANCE_CREATED,
        instanceId,
        resourceType: "workflow_instance",
        resourceId: instanceId,
        actorId: payload.createdByUserId,
        actorEmail: payload.performedByEmail,
        actorRole: payload.performedByRole,
        transitionId: null,
        transitionName: null,
        fromState: null,
        toState: payload.initialState,
      });
    });

    it("onTransitionCompleted() persists TRANSITION_EXECUTED with comment=null when missing", async () => {
      const payload: IWorkflowTransitionCompletedEvent = {
        eventId,
        tenantId,
        instanceId,
        workflowDefinitionId: definitionId,
        fromState: "Applied",
        toState: "Under Review",
        transitionId,
        transitionName: "Submit for Review",
        performedByUserId: mockApproverJwt.sub,
        performedByEmail: mockApproverJwt.email,
        performedByRole: mockApproverJwt.roles[0],
        instancePayload: { days: 10 },
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onTransitionCompleted(payload);

      expectEntry(0, {
        actionType: AuditActionType.TRANSITION_EXECUTED,
        instanceId,
        resourceType: "workflow_instance",
        resourceId: instanceId,
        actorId: payload.performedByUserId,
        actorEmail: payload.performedByEmail,
        actorRole: payload.performedByRole,
        transitionId: payload.transitionId,
        transitionName: payload.transitionName,
        fromState: payload.fromState,
        toState: payload.toState,
        comment: null,
      });
    });

    it("onInstanceCompleted() persists INSTANCE_COMPLETED with toState=finalState", async () => {
      const payload: IWorkflowInstanceCompletedEvent = {
        eventId,
        tenantId,
        instanceId,
        performedByUserId: mockApproverJwt.sub,
        performedByEmail: mockApproverJwt.email,
        performedByRole: mockApproverJwt.roles[0],
        comment: "done",
        workflowDefinitionId: definitionId,
        fromState: "Under Review",
        finalState: "Approved",
        transitionId,
        transitionName: "Approve",
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onInstanceCompleted(payload);

      expectEntry(0, {
        actionType: AuditActionType.INSTANCE_COMPLETED,
        instanceId,
        transitionId: payload.transitionId,
        transitionName: payload.transitionName,
        fromState: payload.fromState,
        toState: payload.finalState,
        comment: payload.comment ?? null,
      });
    });

    it("onInstanceCancelled() persists INSTANCE_CANCELLED with toState='cancelled' and actorId=cancelledByUserId", async () => {
      const payload: IWorkflowInstanceCancelledEvent = {
        eventId,
        tenantId,
        instanceId,
        performedByUserId: mockRequestorJwt.sub,
        performedByEmail: mockRequestorJwt.email,
        workflowDefinitionId: definitionId,
        cancelledByUserId: mockAdminJwt.sub,
        occurredAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      };

      await subscriber.onInstanceCancelled(payload);

      expectEntry(0, {
        actionType: AuditActionType.INSTANCE_CANCELLED,
        instanceId,
        actorId: payload.cancelledByUserId,
        actorEmail: null,
        actorRole: null,
        transitionId: null,
        transitionName: null,
        fromState: null,
        toState: "cancelled",
      });
    });
  });
});

