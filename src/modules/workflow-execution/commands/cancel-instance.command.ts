import { ICommand } from "@nestjs/cqrs";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";

export class CancelInstanceCommand implements ICommand {
  constructor(
    public readonly instanceId: string,
    public readonly actor: IJwtPayload
  ) {}
}
