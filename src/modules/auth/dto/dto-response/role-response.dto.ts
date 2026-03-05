import { ApiProperty } from "@nestjs/swagger";
import { Role } from "../../entities/role.entity";

/**
 * Role Response DTO
 * Used in user responses to show which roles a user has been assigned.
 * Omits internal fields like userRoles relationship.
 */
export class RoleResponseDto {
  @ApiProperty({
    description: "Role's unique identifier",
    format: "uuid",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  id: string;

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
    // dto.tenantId = role.tenantId;
    dto.name = role.name;
    // dto.description = role.description;
    dto.isSystemRole = role.isSystemRole;
    // dto.createdAt = role.createdAt;
    // dto.updatedAt = role.updatedAt;
    return dto;
  }
}
