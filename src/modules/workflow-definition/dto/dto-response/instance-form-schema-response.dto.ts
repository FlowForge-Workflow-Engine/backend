import { ApiProperty } from "@nestjs/swagger";
import { WorkflowInstanceFormSchema } from "@app/shared/interfaces/contracts/workflow-query.contract";

export class InstanceFormSchemaFieldResponseDto {
  @ApiProperty({ example: "days", description: "Payload key/path expected from the client" })
  key: string;

  @ApiProperty({ example: "number", description: "UI field type for client-side rendering" })
  type: string;

  @ApiProperty({ example: "Number of Leave Days", description: "Human-readable form label" })
  label: string;

  @ApiProperty({ example: true, description: "Whether the field is required during instance creation" })
  required: boolean;
}

export class InstanceFormSchemaResponseDto {
  @ApiProperty({
    type: [InstanceFormSchemaFieldResponseDto],
    description: "Client-facing schema fields for workflow instance payload creation",
  })
  fields: InstanceFormSchemaFieldResponseDto[];

  static fromSchema(schema: WorkflowInstanceFormSchema): InstanceFormSchemaResponseDto {
    const dto = new InstanceFormSchemaResponseDto();
    dto.fields = schema.fields.map((field) => ({
      key: field.key,
      type: field.type,
      label: field.label,
      required: field.required,
    }));
    return dto;
  }
}
