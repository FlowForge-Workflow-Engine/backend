import { ApiProperty, OmitType } from "@nestjs/swagger";
import { User } from "../../entities/user.entity";

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
