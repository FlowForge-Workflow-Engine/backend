import { IJwtPayload } from '../../interfaces/jwt-payload.interface';
import { TEST_IDS } from '../constants/uuid.constants';

/**
 * Canonical JWT payload fixtures — one per actor persona.
 * Import these directly in spec files instead of constructing inline objects.
 */
export const mockAdminJwt: IJwtPayload = {
  sub: TEST_IDS.ADMIN_USER_ID,
  email: 'admin@acme.com',
  firstName: 'Jane',
  tenantId: TEST_IDS.TENANT_A_ID,
  tenantSlug: 'acme-corp',
  roles: ['Admin'],
  roleIds: [TEST_IDS.ADMIN_ROLE_CANONICAL_ID],
  plan: 'pro',
};

export const mockApproverJwt: IJwtPayload = {
  sub: TEST_IDS.APPROVER_USER_ID,
  email: 'approver@acme.com',
  firstName: 'John',
  tenantId: TEST_IDS.TENANT_A_ID,
  tenantSlug: 'acme-corp',
  roles: ['Approver'],
  roleIds: [TEST_IDS.APPROVER_ROLE_CANONICAL_ID],
  plan: 'pro',
};

export const mockRequestorJwt: IJwtPayload = {
  sub: TEST_IDS.REQUESTOR_USER_ID,
  email: 'requestor@acme.com',
  firstName: 'Bob',
  tenantId: TEST_IDS.TENANT_A_ID,
  tenantSlug: 'acme-corp',
  roles: ['Requestor'],
  roleIds: [TEST_IDS.REQUESTOR_ROLE_CANONICAL_ID],
  plan: 'pro',
};

