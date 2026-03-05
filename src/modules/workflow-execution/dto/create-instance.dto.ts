import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsObject, IsOptional, IsUUID } from "class-validator";

export class CreateInstanceDto {
  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "UUID of the workflow definition to instantiate",
    format: "uuid",
    required: true,
  })
  @IsNotEmpty({ message: "Workflow definition ID is required" })
  @IsUUID("4", { message: "Workflow definition ID must be a valid UUID" })
  readonly workflowDefinitionId: string;

  @ApiPropertyOptional({
    description: "Initial form payload for the workflow instance (JSON object)",
    example: { requestedBy: "John Doe", amount: 5000 },
  })
  @IsOptional()
  @IsObject({ message: "Payload must be an object" })
  readonly payload?: Record<string, unknown>;
}
