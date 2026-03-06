import { ApiProperty } from "@nestjs/swagger";
import { IsDefined, IsNotEmpty, IsObject, IsUUID } from "class-validator";

export class CreateInstanceDto {
  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "UUID of the workflow definition to instantiate",
    format: "uuid",
    required: true,
  })
  @IsUUID("4", { message: "Workflow definition ID must be a valid UUID" })
  @IsNotEmpty({ message: "Workflow definition ID is required" })
  readonly workflowDefinitionId: string;

  @ApiProperty({
    description: "Initial form payload for the workflow instance (JSON object)",
    example: { requestedBy: "John Doe", amount: 5000 },
    required: true,
  })
  @IsDefined({ message: "Payload is required" })
  @IsObject({ message: "Payload must be an object" })
  readonly payload: Record<string, unknown>;
}
