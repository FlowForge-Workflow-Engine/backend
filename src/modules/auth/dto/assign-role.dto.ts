import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";

export class AssignRoleDto {
  @ApiProperty({
    description: "UUID of the role to assign",
    format: "uuid",
    example: "550e8400-e29b-41d4-a716-446655440000",
    required: true,
  })
  @IsNotEmpty({ message: "Role ID is required" })
  @IsUUID("4", { message: "Role ID must be a valid UUID" })
  roleId: string;
}
