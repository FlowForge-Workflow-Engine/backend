import { TEST_IDS } from '../constants/uuid.constants';

/**
 * Canonical entity fixture objects for the notification module.
 * Covers NotificationTemplate and WebhookConfig entities.
 */

export const MockNotificationTemplate = {
  id: TEST_IDS.NOTIFICATION_TEMPLATE_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  eventTrigger: 'workflow.transition.completed',
  channel: 'email' as const,
  subjectTemplate: 'Your workflow has been updated: {{transitionName}}',
  bodyTemplate: 'workflow-transition-completed',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockWebhookNotificationTemplate = {
  id: TEST_IDS.NOTIFICATION_TEMPLATE_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  eventTrigger: 'workflow.instance.created',
  channel: 'webhook' as const,
  subjectTemplate: null as string | null,
  bodyTemplate: '{"event":"{{eventTrigger}}","instanceId":"{{instanceId}}"}',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const MockWebhookConfig = {
  id: TEST_IDS.WEBHOOK_CONFIG_ID,
  tenantId: TEST_IDS.TENANT_A_ID,
  name: 'Slack Notifications',
  url: 'https://hooks.slack.com/services/TEST/WEBHOOK',
  secret: 'webhook-hmac-secret-key',
  eventTriggers: ['workflow.transition.completed', 'workflow.instance.created'],
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

