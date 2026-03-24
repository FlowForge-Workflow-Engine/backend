jest.mock("@nestjs-modules/mailer", () => ({
  MailerModule: {
    forRoot: jest.fn().mockReturnValue({ module: class {} }),
    forRootAsync: jest.fn().mockReturnValue({ module: class {} }),
  },
  MailerService: {
    sendMail: jest.fn(),
  },
}));

import request from "supertest";
import { DataSource } from "typeorm";
import { sleep } from "@app/shared/utils/sleep";

describe("Leave Management Golden Path (e2e)", () => {
  // Shared app-level dependencies (app lifecycle is managed in test/setup.ts).
  let dataSource: DataSource;

  // Captured IDs/tokens reused across steps (never hardcoded in flow steps).
  let tenantId = "";
  let tenantSlug = "acme-leave";
  let adminUserId = "";
  let requestorUserId = "";
  let approverUserId = "";
  let managerRoleId = "";
  let workflowDefinitionId = "";
  let appliedStateId = "";
  let underReviewStateId = "";
  let approvedStateId = "";
  let submitTransitionId = "";
  let approveTransitionId = "";
  let ruleId = "";
  let instanceId = "";
  let instanceVersion = 0;

  let adminAccessToken = "";
  let adminRefreshToken = "";
  let requestorAccessToken = "";
  let approverAccessToken = "";

  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  beforeAll(async () => {
    dataSource = global.app.get<DataSource>(DataSource);
  });

  it("executes the golden E2E flow for leave management", async () => {
    const http = request(global.app.getHttpServer());

    // Step 1: Create tenant + first admin user.
    const registerTenantRes = await http.post("/api/v1/auth/register/tenant").send({
      tenantName: "Acme Leave Corp",
      tenantSlug,
      firstName: "Jane",
      lastName: "Admin",
      email: "jane.admin@acme-leave.com",
      password: "S3cur3P@ss!",
    });
    expect(registerTenantRes.status).toBe(201);
    expect(registerTenantRes.body.status).toBe("success");
    tenantId = registerTenantRes.body.data.tenant.id;
    adminAccessToken = registerTenantRes.body.data.accessToken;
    adminRefreshToken = registerTenantRes.body.data.refreshToken;
    adminUserId = registerTenantRes.body.data.user.id;
    expect(uuidV4Regex.test(tenantId)).toBe(true);
    expect(typeof adminAccessToken).toBe("string");
    expect(adminAccessToken.length).toBeGreaterThan(0);
    expect(typeof adminRefreshToken).toBe("string");
    expect(adminRefreshToken.length).toBeGreaterThan(0);
    await sleep(200);

    // Step 2: Self-register requestor user in same tenant (by tenantSlug).
    const registerRequestorRes = await http.post("/api/v1/auth/register").send({
      firstName: "Bob",
      lastName: "Requestor",
      email: "bob.requestor@acme-leave.com",
      password: "S3cur3P@ss!",
      tenantSlug,
    });
    expect(registerRequestorRes.status).toBe(201);
    requestorAccessToken = registerRequestorRes.body.data.accessToken;
    requestorUserId = registerRequestorRes.body.data.user.id;
    expect(typeof requestorAccessToken).toBe("string");
    expect(requestorAccessToken.length).toBeGreaterThan(0);
    await sleep(200);

    // Step 3: Login as tenant admin.
    const adminLoginRes = await http.post("/api/v1/auth/login").send({
      email: "jane.admin@acme-leave.com",
      password: "S3cur3P@ss!",
      tenantId,
    });
    expect(adminLoginRes.status).toBe(200);
    adminAccessToken = adminLoginRes.body.data.accessToken;
    adminRefreshToken = adminLoginRes.body.data.refreshToken;
    expect(typeof adminAccessToken).toBe("string");
    expect(adminAccessToken.length).toBeGreaterThan(0);

    // Step 4: Get current logged-in admin user.
    const meRes = await http.get("/api/v1/auth/me").set("Authorization", `Bearer ${adminAccessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.id).toBe(adminUserId);
    expect(meRes.body.data.email).toBe("jane.admin@acme-leave.com");
    expect(meRes.body.data.tenantId).toBe(tenantId);
    expect((meRes.body.data.roles as Array<{ name: string }>).some((r) => r.name === "Admin")).toBe(true);

    // Step 5: Admin creates an approver user (tenantId must come from JWT).
    const createApproverRes = await http
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        firstName: "Alice",
        lastName: "Approver",
        email: "alice.approver@acme-leave.com",
        password: "S3cur3P@ss!",
      });

    expect(createApproverRes.status).toBe(201);
    approverUserId = createApproverRes.body.data.id;
    expect(createApproverRes.body.data.tenantId).toBe(tenantId);
    expect(createApproverRes.body.data.isActive).toBe(true);
    await sleep(500);

    // Wait for all users to be processed via NATS events
    // await waitForUsers(http, adminAccessToken, 3, 20000);

    // Step 6: List users and verify tenant scoping.
    const usersRes = await http
      .get("/api/v1/users?page=1&limit=20")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(usersRes.status).toBe(200);
    expect(usersRes.body.count).toBeGreaterThanOrEqual(3);
    for (const user of usersRes.body.data as Array<{ tenantId: string }>) {
      expect(user.tenantId).toBe(tenantId);
    }

    // Step 7: Create Manager role.
    const createRoleRes = await http
      .post("/api/v1/roles")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        name: "Manager",
        description: "Can review and approve leave requests",
      });
    expect(createRoleRes.status).toBe(201);
    managerRoleId = createRoleRes.body.data.id;
    expect(createRoleRes.body.data.name).toBe("Manager");
    expect(createRoleRes.body.data.isSystemRole).toBe(false);
    expect(createRoleRes.body.data.tenantId).toBe(tenantId);
    await sleep(100);

    // Step 7b: Assign manager role to approver user.
    const assignRoleRes = await http
      .post(`/api/v1/users/${approverUserId}/roles`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ roleId: managerRoleId });
    // Current endpoint contract is NO_CONTENT.
    expect(assignRoleRes.status).toBe(204);
    await sleep(100);

    // Step 8: Get all roles and verify defaults + Manager role.
    const rolesRes = await http.get("/api/v1/roles").set("Authorization", `Bearer ${adminAccessToken}`);
    expect(rolesRes.status).toBe(200);
    const roleNames = (rolesRes.body.data as Array<{ name: string }>).map((r) => r.name);
    expect(roleNames).toEqual(expect.arrayContaining(["Admin", "Approver", "Requestor", "Manager"]));
    expect((rolesRes.body.data as Array<{ id: string }>).some((r) => r.id === managerRoleId)).toBe(true);

    // Step 9: Fetch rule metadata for workflow rule builder.
    const metadataRes = await http
      .get("/api/v1/workflow-rules/metadata")
      .set("Authorization", `Bearer ${adminAccessToken}`);
    expect(metadataRes.status).toBe(200);
    expect(metadataRes.body.data.expressionOperators).toEqual(
      expect.arrayContaining(["greaterThan", "lessThan", "equal"])
    );
    expect(metadataRes.body.data.facts).toEqual(expect.arrayContaining(["payload", "user", "instance"]));
    expect(metadataRes.body.data.expressionRuleDefinitionExample).toBeDefined();
    expect(metadataRes.body.data.customRuleDefinitionExample).toBeDefined();

    // Step 10: Create workflow definition in draft.
    const createDefinitionRes = await http
      .post("/api/v1/workflow-definitions")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        name: "Leave Approval Workflow",
        description: "Manages employee leave requests from application to approval.",
      });
    expect(createDefinitionRes.status).toBe(201);
    workflowDefinitionId = createDefinitionRes.body.data.id;
    expect(createDefinitionRes.body.data.status).toBe("draft");
    expect(createDefinitionRes.body.data.currentVersion).toBe(1);
    expect(createDefinitionRes.body.data.tenantId).toBe(tenantId);
    await sleep(100);

    // Step 11: Create 3 states (Applied -> Under Review -> Approved).
    const appliedStateRes = await http
      .post(`/api/v1/workflow-definitions/${workflowDefinitionId}/states`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        name: "Applied",
        description: "Leave request submitted by employee",
        isInitial: true,
        isTerminal: false,
        positionX: 100,
        positionY: 200,
        metadata: { color: "#3B82F6", icon: "file-text" },
      });
    expect(appliedStateRes.status).toBe(201);
    appliedStateId = appliedStateRes.body.data.id;
    expect(appliedStateRes.body.data.workflowDefinitionId).toBe(workflowDefinitionId);
    expect(appliedStateRes.body.data.tenantId).toBe(tenantId);
    await sleep(100);

    const reviewStateRes = await http
      .post(`/api/v1/workflow-definitions/${workflowDefinitionId}/states`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        name: "Under Review",
        description: "Leave request is being reviewed by manager",
        isInitial: false,
        isTerminal: false,
        positionX: 400,
        positionY: 200,
        metadata: { color: "#F59E0B", icon: "search" },
      });
    expect(reviewStateRes.status).toBe(201);
    underReviewStateId = reviewStateRes.body.data.id;
    await sleep(100);

    const approvedStateRes = await http
      .post(`/api/v1/workflow-definitions/${workflowDefinitionId}/states`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        name: "Approved",
        description: "Leave request approved",
        isInitial: false,
        isTerminal: true,
        positionX: 700,
        positionY: 200,
        metadata: { color: "#10B981", icon: "check-circle" },
      });
    expect(approvedStateRes.status).toBe(201);
    approvedStateId = approvedStateRes.body.data.id;
    await sleep(100);

    // Step 12: Create 2 transitions (open submit + manager-only approve).
    const submitTransitionRes = await http
      .post(`/api/v1/workflow-definitions/${workflowDefinitionId}/transitions`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        name: "Submit for Review",
        fromStateId: appliedStateId,
        toStateId: underReviewStateId,
        allowedRoleIds: [],
        requiresComment: false,
      });
    expect(submitTransitionRes.status).toBe(201);
    submitTransitionId = submitTransitionRes.body.data.id;
    expect(submitTransitionRes.body.data.workflowDefinitionId).toBe(workflowDefinitionId);
    await sleep(100);

    const approveTransitionRes = await http
      .post(`/api/v1/workflow-definitions/${workflowDefinitionId}/transitions`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        name: "Approve Leave",
        fromStateId: underReviewStateId,
        toStateId: approvedStateId,
        allowedRoleIds: [managerRoleId],
        requiresComment: true,
      });
    expect(approveTransitionRes.status).toBe(201);
    approveTransitionId = approveTransitionRes.body.data.id;
    await sleep(100);

    // Step 13: Attach rule days > 7 to Approve Leave.
    const addRuleRes = await http
      .post(`/api/v1/workflow-definitions/${workflowDefinitionId}/transitions/${approveTransitionId}/rules`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({
        ruleName: "leave-days-greater-than-7",
        ruleDefinition: {
          all: [{ fact: "payload", path: "$.days", operator: "greaterThan", value: 7 }],
        },
        evaluationOrder: 0,
        schemaFields: [
          {
            key: "days",
            type: "number",
            label: "Number of Leave Days",
            required: true,
          },
        ],
      });
    expect(addRuleRes.status).toBe(201);
    ruleId = addRuleRes.body.data.id;
    expect(addRuleRes.body.data.transitionId).toBe(approveTransitionId);
    expect(addRuleRes.body.data.ruleName).toBe("leave-days-greater-than-7");
    expect(addRuleRes.body.data.ruleDefinition.all[0].operator).toBe("greaterThan");
    expect(ruleId).toBeDefined();
    await sleep(100);

    // Step 14: Verify instance form schema includes required days field.
    const schemaRes = await http
      .get(`/api/v1/workflow-definitions/${workflowDefinitionId}/instance-form-schema`)
      .set("Authorization", `Bearer ${adminAccessToken}`);
    expect(schemaRes.status).toBe(200);
    const daysField = (
      schemaRes.body.data.fields as Array<{ key: string; type: string; label: string; required: boolean }>
    ).find((f) => f.key === "days");
    expect(daysField).toBeDefined();
    expect(daysField?.type).toBe("number");
    expect(daysField?.required).toBe(true);

    // Step 15: Publish workflow and verify immutable snapshot.
    const publishRes = await http
      .post(`/api/v1/workflow-definitions/${workflowDefinitionId}/publish`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({});
    expect(publishRes.status).toBe(201);
    expect(publishRes.body.data.versionNumber).toBe(1);
    expect(publishRes.body.data.isActive).toBe(true);
    expect(publishRes.body.data.snapshot.states.length).toBe(3);
    expect(publishRes.body.data.snapshot.transitions.length).toBe(2);
    expect(
      (publishRes.body.data.snapshot.transitions as Array<{ id: string; rules?: unknown[] }>).find(
        (t) => t.id === approveTransitionId
      )?.rules?.length
    ).toBeGreaterThan(0);
    expect(publishRes.body.data.publishedBy).toBe(adminUserId);
    await sleep(100);

    // Step 16: List workflow definitions and verify published one appears.
    const listDefinitionRes = await http
      .get("/api/v1/workflow-definitions?page=1&limit=20")
      .set("Authorization", `Bearer ${adminAccessToken}`);
    expect(listDefinitionRes.status).toBe(200);
    expect(listDefinitionRes.body.count).toBeGreaterThanOrEqual(1);
    const listedDefinition = (
      listDefinitionRes.body.data as Array<{ id: string; status: string; tenantId: string }>
    ).find((d) => d.id === workflowDefinitionId);
    expect(listedDefinition?.status).toBe("published");
    expect(listedDefinition?.tenantId).toBe(tenantId);

    // Step 17: Get one workflow definition by id.
    const oneDefinitionRes = await http
      .get(`/api/v1/workflow-definitions/${workflowDefinitionId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);
    expect(oneDefinitionRes.status).toBe(200);
    expect(oneDefinitionRes.body.data.id).toBe(workflowDefinitionId);
    expect(oneDefinitionRes.body.data.status).toBe("published");
    expect(oneDefinitionRes.body.data.currentVersion).toBe(2);

    // Step 18: Requestor creates workflow instance with days=10.
    const createInstanceRes = await http
      .post("/api/v1/workflow-instances")
      .set("Authorization", `Bearer ${requestorAccessToken}`)
      .send({
        workflowDefinitionId,
        payload: {
          employeeName: "Bob Requestor",
          leaveType: "annual",
          startDate: "2026-04-01",
          endDate: "2026-04-10",
          days: 10,
          reason: "Family vacation",
        },
      });
    expect(createInstanceRes.status).toBe(201);
    instanceId = createInstanceRes.body.data.id;
    instanceVersion = createInstanceRes.body.data.version;
    expect(createInstanceRes.body.data.currentStateName).toBe("Applied");
    expect(createInstanceRes.body.data.status).toBe("active");
    expect(instanceVersion).toBe(1);
    expect(createInstanceRes.body.data.definitionVersion).toBe(1);
    expect(createInstanceRes.body.data.tenantId).toBe(tenantId);
    expect(createInstanceRes.body.data.createdBy).toBe(requestorUserId);
    await sleep(100);

    // Step 19: Allowed transitions from Applied (raw array response).
    const allowedFromAppliedRes = await http
      .get(`/api/v1/workflow-instances/${instanceId}/allowed-transitions`)
      .set("Authorization", `Bearer ${requestorAccessToken}`);
    expect(allowedFromAppliedRes.status).toBe(200);
    expect(Array.isArray(allowedFromAppliedRes.body)).toBe(true);
    expect(allowedFromAppliedRes.body).toHaveLength(1);
    expect(allowedFromAppliedRes.body[0].name).toBe("Submit for Review");
    expect(allowedFromAppliedRes.body[0].id).toBe(submitTransitionId);
    expect(allowedFromAppliedRes.body[0].requiresComment).toBe(false);
    expect(allowedFromAppliedRes.body[0].allowedRoleIds).toEqual([]);
    expect(
      (allowedFromAppliedRes.body as Array<{ id: string }>).some((t) => t.id === approveTransitionId)
    ).toBe(false);

    // Step 20: Execute Applied -> Under Review using requestor token.
    const transitionToReviewRes = await http
      .post(`/api/v1/workflow-instances/${instanceId}/transitions`)
      .set("Authorization", `Bearer ${requestorAccessToken}`)
      .send({
        transitionId: submitTransitionId,
        lastKnownVersion: 1,
        comment: "Submitting my leave request for review.",
        idempotencyKey: `leave-submit-${instanceId}-v1`,
      });
    expect(transitionToReviewRes.status).toBe(201);
    expect(transitionToReviewRes.body.data.currentStateName).toBe("Under Review");
    expect(transitionToReviewRes.body.data.version).toBe(2);
    expect(transitionToReviewRes.body.data.status).toBe("active");
    instanceVersion = 2;
    await sleep(100);

    // Step 20b: Login approver then execute Under Review -> Approved.
    const approverLoginRes = await http.post("/api/v1/auth/login").send({
      email: "alice.approver@acme-leave.com",
      password: "S3cur3P@ss!",
      tenantId,
    });
    expect(approverLoginRes.status).toBe(200);
    approverAccessToken = approverLoginRes.body.data.accessToken;
    expect(typeof approverAccessToken).toBe("string");
    expect(approverAccessToken.length).toBeGreaterThan(0);
    await sleep(100);

    const transitionToApprovedRes = await http
      .post(`/api/v1/workflow-instances/${instanceId}/transitions`)
      .set("Authorization", `Bearer ${approverAccessToken}`)
      .send({
        transitionId: approveTransitionId,
        lastKnownVersion: 2,
        comment: "10 days approved. HR policy satisfied.",
        idempotencyKey: `leave-approve-${instanceId}-v2`,
      });
    expect(transitionToApprovedRes.status).toBe(201);
    expect(transitionToApprovedRes.body.data.currentStateName).toBe("Approved");
    expect(transitionToApprovedRes.body.data.version).toBe(3);
    expect(transitionToApprovedRes.body.data.status).toBe("completed");
    expect(transitionToApprovedRes.body.data.completedAt).toBeTruthy();
    instanceVersion = 3;
    await sleep(100);

    // Step 21: Get instance detail and verify final state + version.
    const instanceDetailRes = await http
      .get(`/api/v1/workflow-instances/${instanceId}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);
    expect(instanceDetailRes.status).toBe(200);
    expect(instanceDetailRes.body.data.currentStateName).toBe("Approved");
    expect(instanceDetailRes.body.data.status).toBe("completed");
    expect(instanceDetailRes.body.data.version).toBe(3);
    expect(instanceDetailRes.body.data.completedAt).toBeTruthy();
    expect(instanceVersion).toBe(3);

    // Step 22: Verify audit trail + immutability trigger.
    const auditRes = await http
      .get(`/api/v1/workflow-instances/${instanceId}/audit-logs?page=1&limit=20`)
      .set("Authorization", `Bearer ${adminAccessToken}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.count).toBeGreaterThanOrEqual(3);

    const auditLogs = auditRes.body.data as Array<{
      id: string;
      actionType: string;
      fromState: string | null;
      toState: string | null;
      actorEmail: string;
      actorRole: string;
      eventId: string;
      tenantId: string;
      instanceId: string;
      updatedAt?: unknown;
    }>;
    expect(auditLogs.some((l) => l.actionType === "instance_created" && l.toState === "Applied")).toBe(true);
    expect(
      auditLogs.some(
        (l) =>
          l.actionType === "transition_executed" && l.fromState === "Applied" && l.toState === "Under Review"
      )
    ).toBe(true);
    expect(
      auditLogs.some(
        (l) =>
          l.actionType === "transition_executed" && l.fromState === "Under Review" && l.toState === "Approved"
      )
    ).toBe(true);
    for (const log of auditLogs) {
      expect(log.tenantId).toBe(tenantId);
      expect(log.instanceId).toBe(instanceId);
      expect(typeof log.actorEmail).toBe("string");
      expect(typeof log.actorRole).toBe("string");
      expect(uuidV4Regex.test(log.eventId)).toBe(true);
      expect(log.updatedAt).toBeUndefined();
    }

    const firstAuditLogId = auditLogs[0]?.id;

    expect(firstAuditLogId).toBeDefined();
    const updateResult = await dataSource.query(
      `UPDATE audit_logs SET comment = 'tampered' WHERE id = $1 RETURNING *`,
      [firstAuditLogId]
    );

    // Verify no rows were returned (immutability enforced)
    expect(updateResult[0]).toEqual([]);

    // Cross-cutting: tenant isolation (Tenant B cannot read Tenant A definition).
    const tenantBRes = await http.post("/api/v1/auth/register/tenant").send({
      tenantName: "Rival Corp",
      tenantSlug: "rival-corp",
      firstName: "Ria",
      lastName: "Admin",
      email: "ria.admin@rival-corp.com",
      password: "S3cur3P@ss!",
    });
    expect(tenantBRes.status).toBe(201);
    const tenantBToken = tenantBRes.body.data.accessToken as string;
    await sleep(100);

    const crossTenantReadRes = await http
      .get(`/api/v1/workflow-definitions/${workflowDefinitionId}`)
      .set("Authorization", `Bearer ${tenantBToken}`);
    expect(crossTenantReadRes.status).toBe(404);

    // Cross-cutting: optimistic lock conflict.
    const staleVersionRes = await http
      .post(`/api/v1/workflow-instances/${instanceId}/transitions`)
      .set("Authorization", `Bearer ${requestorAccessToken}`)
      .send({
        transitionId: submitTransitionId,
        lastKnownVersion: 999,
        comment: "stale",
      });
    expect(staleVersionRes.status).toBe(422);
    expect(staleVersionRes.body.errorCode).toBe("WORKFLOW_INSTANCE_NOT_ACTIVE");
    await sleep(100);

    // Cross-cutting: rule failure (days=5 should fail approve rule days > 7).
    const shortInstanceRes = await http
      .post("/api/v1/workflow-instances")
      .set("Authorization", `Bearer ${requestorAccessToken}`)
      .send({
        workflowDefinitionId,
        payload: {
          employeeName: "Bob Requestor",
          leaveType: "annual",
          startDate: "2026-05-01",
          endDate: "2026-05-05",
          days: 5,
          reason: "Short leave",
        },
      });
    expect(shortInstanceRes.status).toBe(201);
    const shortInstanceId = shortInstanceRes.body.data.id as string;
    await sleep(100);

    const shortToReviewRes = await http
      .post(`/api/v1/workflow-instances/${shortInstanceId}/transitions`)
      .set("Authorization", `Bearer ${requestorAccessToken}`)
      .send({
        transitionId: submitTransitionId,
        lastKnownVersion: 1,
        comment: "send for review",
      });
    expect(shortToReviewRes.status).toBe(201);
    await sleep(100);

    const noCommentRes = await http
      .post(`/api/v1/workflow-instances/${shortInstanceId}/transitions`)
      .set("Authorization", `Bearer ${approverAccessToken}`)
      .send({
        transitionId: approveTransitionId,
        lastKnownVersion: 2,
      });
    expect(noCommentRes.status).toBe(422);
    expect(noCommentRes.body.errorCode).toBe("COMMENT_REQUIRED");
    await sleep(100);

    const ruleFailRes = await http
      .post(`/api/v1/workflow-instances/${shortInstanceId}/transitions`)
      .set("Authorization", `Bearer ${approverAccessToken}`)
      .send({
        transitionId: approveTransitionId,
        lastKnownVersion: 2,
        comment: "Trying",
      });
    expect(ruleFailRes.status).toBe(422);
    expect(ruleFailRes.body.errorCode).toBe("TRANSITION_RULES_FAILED");
  });
});
