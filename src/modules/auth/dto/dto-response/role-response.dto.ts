import { ApiProperty } from "@nestjs/swagger";
import { Role } from "../../entities/role.entity";

export class RoleSummaryResponseDto {
  @ApiProperty({
    description: "Role's unique identifier",
    format: "uuid",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  id: string;

  @ApiProperty({
    description: "Role name - unique within tenant",
    example: "Admin",
  })
  name: string;

  @ApiProperty({
    description: "Flag indicating if role is system-defined and cannot be deleted",
    example: true,
  })
  isSystemRole: boolean;

  static fromEntity(role: Role): RoleSummaryResponseDto {
    const dto = new RoleSummaryResponseDto();
    dto.id = role.id;
    dto.name = role.name;
    dto.isSystemRole = role.isSystemRole;
    return dto;
  }
}

/**
 * Role Response DTO
 * Used in role-related responses and embedded role payloads.
 * Omits internal relationship fields like userRoles.
 */
export class RoleResponseDto extends RoleSummaryResponseDto {
  @ApiProperty({
    description: "Tenant ID for multi-tenancy isolation",
    format: "uuid",
    example: "550e8400-e29b-41d4-a716-446655440001",
  })
  tenantId: string;

  @ApiProperty({
    description: "Role name - unique within tenant",
    example: "Admin",
  })
  name: string;

  @ApiProperty({
    description: "Optional description explaining role purpose and permissions",
    example: "Full system access and user management",
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: "Flag indicating if role is system-defined and cannot be deleted",
    example: true,
  })
  isSystemRole: boolean;

  @ApiProperty({
    description: "Role creation timestamp",
    example: "2026-03-01T08:00:00Z",
  })
  createdAt: Date;

  @ApiProperty({
    description: "Role last update timestamp",
    example: "2026-03-05T10:30:00Z",
  })
  updatedAt: Date;

  /**
   * Transform a Role entity to RoleResponseDto
   * @param role - The role entity to transform
   * @returns RoleResponseDto with all fields populated
   */
  static fromEntity(role: Role): RoleResponseDto {
    const dto = new RoleResponseDto();
    dto.id = role.id;
    dto.name = role.name;
    dto.isSystemRole = role.isSystemRole;
    dto.tenantId = role.tenantId;
    dto.description = role.description;
    dto.createdAt = role.createdAt;
    dto.updatedAt = role.updatedAt;
    return dto;
  }
}
