import { ICommand } from "@nestjs/cqrs";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";

export class ExecuteTransitionCommand implements ICommand {
  constructor(
    public readonly instanceId: string,
    public readonly transitionId: string,
    public readonly lastKnownVersion: number,
    public readonly comment: string | undefined,
    public readonly actor: IJwtPayload,
    public readonly idempotencyKey?: string
  ) {}
}
