import { ApiProperty, OmitType } from "@nestjs/swagger";
import { User } from "../../entities/user.entity";
import { RoleResponseDto } from "./role-response.dto";

/**
 * Base User Response DTO
 * Omits passwordHash for security — never expose hashed passwords in API responses
 * Includes all user properties except the sensitive password hash
 */
export class UserResponseDto extends OmitType(User, ["passwordHash"] as const) {
  @ApiProperty({ description: "User's unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ description: "Tenant ID for multi-tenancy isolation", format: "uuid" })
  tenantId: string;

  @ApiProperty({ example: "john.doe@acme.com", description: "User's email address" })
  email: string;

  @ApiProperty({ example: "John", description: "User's first name" })
  firstName: string;

  @ApiProperty({ example: "Doe", description: "User's last name" })
  lastName: string;

  @ApiProperty({ example: true, description: "Whether the user account is active" })
  isActive: boolean;

  @ApiProperty({ example: false, description: "Whether the user's email has been verified" })
  isEmailVerified: boolean;

  @ApiProperty({
    example: "2026-03-05T10:30:00Z",
    nullable: true,
    description: "Timestamp of user's last login",
  })
  lastLoginAt: Date | null;

  @ApiProperty({ example: "2026-03-01T08:00:00Z", description: "User creation timestamp" })
  createdAt: Date;

  @ApiProperty({ example: "2026-03-05T10:30:00Z", description: "User last update timestamp" })
  updatedAt: Date;

  @ApiProperty({
    type: [RoleResponseDto],
    description: "Array of roles assigned to this user",
    example: [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        tenantId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Admin",
        description: "Full system access",
        isSystemRole: true,
        createdAt: "2026-03-01T08:00:00Z",
        updatedAt: "2026-03-05T10:30:00Z",
      },
    ],
  })
  roles: RoleResponseDto[];

  /**
   * Transform a User entity to UserResponseDto
   * Converts userRoles relationship to roles array using RoleResponseDto
   * @param user - The user entity to transform
   * @returns UserResponseDto with all fields populated
   */
  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.tenantId = user.tenantId;
    dto.email = user.email;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.isActive = user.isActive;
    dto.isEmailVerified = user.isEmailVerified;
    dto.lastLoginAt = user.lastLoginAt;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    // Transform userRoles to roles array
    dto.roles =
      user.userRoles
        ?.map((ur) => ur.role && RoleResponseDto.fromEntity(ur.role))
        .filter((role): role is RoleResponseDto => role !== undefined && role !== null) ?? [];
    return dto;
  }
}

/**
 * User List Response DTO
 * Used for GET /users endpoint
 * Extends UserResponseDto to maintain consistency
 */
export class UserListResponseDto extends UserResponseDto {}

/**
 * User Detail Response DTO
 * Used for GET /users/:id endpoint
 * Extends UserResponseDto to maintain consistency
 */
export class UserDetailResponseDto extends UserResponseDto {}

/**
 * User Created Response DTO
 * Used for POST /users endpoint (201 Created)
 * Extends UserResponseDto to maintain consistency
 */
export class UserCreatedResponseDto extends UserResponseDto {}
