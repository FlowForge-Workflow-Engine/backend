import { IQuery } from "@nestjs/cqrs";

export interface AllowedTransition {
  id: string;
  name: string;
  toStateId: string;
  toStateName: string;
  requiresComment: boolean;
}

export class GetAllowedTransitionsQuery implements IQuery {
  constructor(
    public readonly instanceId: string,
    public readonly tenantId: string,
    /** Role names from the actor's JWT payload */
    public readonly userRoles: string[]
  ) {}
}

export type GetAllowedTransitionsResult = AllowedTransition[];
