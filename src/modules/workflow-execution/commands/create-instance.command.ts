import { ICommand } from "@nestjs/cqrs";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";

export class CreateInstanceCommand implements ICommand {
  constructor(
    public readonly workflowDefinitionId: string,
    public readonly payload: Record<string, unknown>,
    public readonly actor: IJwtPayload
  ) {}
}
