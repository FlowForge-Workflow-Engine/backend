import { TEST_IDS } from '../constants/uuid.constants';

/**
 * Canonical entity fixture objects for the audit module.
 * AuditLog is an immutable, append-only record — no updatedAt.
 */

export const MockAuditLog = {
  id: TEST_IDS.AUDIT_LOG_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  instanceId: TEST_IDS.INSTANCE_ID,
  actorId: TEST_IDS.ADMIN_USER_ID,
  actorEmail: 'admin@acme.com',
  actorRole: 'Admin',
  actionType: 'transition_executed' as const,
  transitionId: TEST_IDS.TRANSITION_ID,
  transitionName: 'Submit for Review',
  fromState: 'Draft',
  toState: 'Under Review',
  comment: null as string | null,
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0 (test)',
  eventId: TEST_IDS.EVENT_ID,
  resourceType: 'workflow_instance',
  resourceId: TEST_IDS.INSTANCE_ID,
  occurredAt: new Date('2024-01-01T10:00:00Z'),
  payload: null as Record<string, unknown> | null,
  createdAt: new Date('2024-01-01T10:00:00Z'),
};

export const MockInstanceCreatedAuditLog = {
  ...MockAuditLog,
  actionType: 'instance_created' as const,
  transitionId: null,
  transitionName: null,
  fromState: null,
  toState: 'Draft',
};

