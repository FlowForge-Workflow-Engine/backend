import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

/**
 * DTO for route parameters that carry a UUID :id.
 */
export class IdParamDto {
  @ApiProperty({ description: "Resource UUID", format: "uuid" })
  @IsUUID("4")
  readonly id: string;
}
