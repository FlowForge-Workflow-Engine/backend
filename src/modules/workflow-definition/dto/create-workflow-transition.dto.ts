import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateWorkflowTransitionDto {
  @ApiProperty({ example: "Submit for Approval" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  readonly name: string;

  @ApiProperty({ example: "uuid-of-from-state" })
  @IsUUID()
  readonly fromStateId: string;

  @ApiProperty({ example: "uuid-of-to-state" })
  @IsUUID()
  readonly toStateId: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["uuid-role-admin", "uuid-role-approver"],
    description: "Role IDs allowed to trigger this transition. Empty = any role.",
  })
  @IsArray()
  @IsUUID("4", { each: true })
  @IsOptional()
  readonly allowedRoleIds?: string[];

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  readonly requiresComment?: boolean;
}
