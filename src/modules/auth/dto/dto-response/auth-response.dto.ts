import { ApiProperty } from "@nestjs/swagger";

/**
 * Authentication Token Pair Response DTO
 * Returned after successful login or token refresh
 */
export class AuthTokensResponseDto {
  @ApiProperty({
    description: "JWT access token for API authentication (short-lived)",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  accessToken: string;

  @ApiProperty({
    description: "Opaque refresh token for token rotation (long-lived)",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  refreshToken: string;
}

/**
 * User Info in Onboarding Response
 */
export class OnboardingUserInfoDto {
  @ApiProperty({ description: "User's unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ example: "john.doe@acme.com", description: "User's email address" })
  email: string;

  @ApiProperty({ example: "John", description: "User's first name" })
  firstName: string;

  @ApiProperty({ example: "Doe", description: "User's last name" })
  lastName: string;
}

/**
 * Tenant Info in Onboarding Response
 */
export class OnboardingTenantInfoDto {
  @ApiProperty({ description: "Tenant's unique identifier", format: "uuid" })
  id: string;

  @ApiProperty({ example: "Acme Corp", description: "Tenant's name" })
  name: string;

  @ApiProperty({ example: "acme-corp", description: "Tenant's URL-friendly slug" })
  slug: string;
}

/**
 * Tenant Registration Response DTO
 * Returned after successful tenant and admin user registration
 */
export class RegisterTenantResponseDto extends AuthTokensResponseDto {
  @ApiProperty({ description: "Created user information" })
  user: OnboardingUserInfoDto;

  @ApiProperty({ description: "Created tenant information", required: false })
  tenant?: OnboardingTenantInfoDto;
}

/**
 * User Registration Response DTO
 * Returned after successful employee self-registration
 */
export class RegisterUserResponseDto extends AuthTokensResponseDto {
  @ApiProperty({ description: "Created user information" })
  user: OnboardingUserInfoDto;
}

/**
 * Login Response DTO
 * Returned after successful authentication
 */
export class LoginResponseDto extends AuthTokensResponseDto {}

/**
 * Refresh Token Response DTO
 * Returned after successful token refresh
 */
export class RefreshTokenResponseDto extends AuthTokensResponseDto {}
