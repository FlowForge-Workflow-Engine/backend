export interface IJwtPayload {
  /** User UUID */
  readonly sub: string;
  /** User email */
  readonly email: string;
  /** Tenant UUID */
  readonly tenantId: string;
  /** Tenant slug */
  readonly tenantSlug: string;
  /** Assigned role names */
  readonly roles: string[];
  /** Tenant plan */
  readonly plan: string;
  /** User first name */
  readonly firstName: string;
}

