import { Injectable } from "@nestjs/common";
import { RuleContext } from "../interfaces/rule.interfaces";

/**
 * Transforms a RuleContext into a flat facts map consumed by json-rules-engine.
 *
 * json-rules-engine supports nested objects — we expose the context
 * as three top-level namespaces: `payload`, `user`, and `instance`.
 * Rule authors address facts with path notation, e.g.:
 *   { fact: 'user', path: '$.role', operator: 'equal', value: 'Admin' }
 *   { fact: 'payload', path: '$.amount', operator: 'greaterThan', value: 1000 }
 */
@Injectable()
export class RuleContextBuilder {
  build(context: RuleContext): Record<string, unknown> {
    return {
      payload: context.payload,
      user: {
        id: context.user.id,
        role: context.user.role,
        roles: context.user.roles,
      },
      instance: {
        currentState: context.instance.currentState,
        createdAt: context.instance.createdAt,
      },
    };
  }
}
