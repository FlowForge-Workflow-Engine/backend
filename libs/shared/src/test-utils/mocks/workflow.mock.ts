import { TEST_IDS } from '../constants/uuid.constants';

/**
 * Canonical entity fixture objects for the workflow-definition and workflow-execution modules.
 * These are plain-object snapshots — sufficient for unit tests.
 */

export const MockWorkflowDefinition = {
  id: TEST_IDS.WORKFLOW_DEFINITION_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  name: 'Leave Approval Workflow',
  description: 'Manages employee leave approval process',
  currentVersion: 1,
  status: 'draft' as const,
  createdBy: TEST_IDS.ADMIN_USER_ID,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockPublishedWorkflowDefinition = {
  ...MockWorkflowDefinition,
  status: 'published' as const,
};

export const MockInitialState = {
  id: TEST_IDS.INITIAL_STATE_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
  name: 'Draft',
  description: 'Initial draft state',
  isInitial: true,
  isTerminal: false,
  positionX: 100,
  positionY: 100,
  metadata: null as Record<string, unknown> | null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockIntermediateState = {
  id: TEST_IDS.INTERMEDIATE_STATE_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
  name: 'Under Review',
  description: 'Awaiting manager approval',
  isInitial: false,
  isTerminal: false,
  positionX: 300,
  positionY: 100,
  metadata: null as Record<string, unknown> | null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockTerminalState = {
  id: TEST_IDS.TERMINAL_STATE_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
  name: 'Approved',
  description: 'Leave request approved',
  isInitial: false,
  isTerminal: true,
  positionX: 500,
  positionY: 100,
  metadata: null as Record<string, unknown> | null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockWorkflowTransition = {
  id: TEST_IDS.TRANSITION_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
  name: 'Submit for Review',
  fromStateId: TEST_IDS.INITIAL_STATE_ID,
  toStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
  allowedRoleIds: [TEST_IDS.REQUESTOR_ROLE_CANONICAL_ID],
  requiresComment: false,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockOpenTransition = {
  id: TEST_IDS.TRANSITION_ID_2,
  tenantId: TEST_IDS.TENANT_A_ID,
  workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
  name: 'Approve',
  fromStateId: TEST_IDS.INTERMEDIATE_STATE_ID,
  toStateId: TEST_IDS.TERMINAL_STATE_ID,
  allowedRoleIds: [] as string[], // open to all roles
  requiresComment: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockTransitionRule = {
  id: TEST_IDS.RULE_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  transitionId: TEST_IDS.TRANSITION_ID,
  ruleName: 'require-leave-days',
  ruleDefinition: {
    all: [
      {
        fact: 'leaveDays',
        operator: 'greaterThan',
        value: 0,
      },
    ],
  },
  evaluationOrder: 0,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockWorkflowInstance = {
  id: TEST_IDS.INSTANCE_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  workflowDefinitionId: TEST_IDS.WORKFLOW_DEFINITION_ID,
  definitionVersion: 1,
  currentStateId: TEST_IDS.INITIAL_STATE_ID,
  currentStateName: 'Draft',
  payload: { leaveDays: 5, reason: 'Annual vacation' },
  status: 'active' as const,
  version: 1,
  createdBy: TEST_IDS.REQUESTOR_USER_ID,
  completedAt: null as Date | null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockCompletedWorkflowInstance = {
  ...MockWorkflowInstance,
  id: TEST_IDS.INSTANCE_ID_2,
  currentStateId: TEST_IDS.TERMINAL_STATE_ID,
  currentStateName: 'Approved',
  status: 'completed' as const,
  version: 2,
  completedAt: new Date('2024-02-01T10:00:00Z'),
};

