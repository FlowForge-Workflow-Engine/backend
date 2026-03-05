import { Body, Controller, Get, HttpCode, HttpStatus, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@app/shared/decorators/public.decorator";
import { CurrentUser } from "@app/shared/decorators/current-user.decorator";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { ApiSuccessResponse } from "@app/shared/decorators/swagger-generic-response.decorator";
import { ApiResponseDto } from "@app/shared/dto/base-response.dto";
import { AuthService } from "../services/auth.service";
import { OnboardingService } from "../services/onboarding.service";
import { LoginDto } from "../dto/login.dto";
import { RegisterDto } from "../dto/register.dto";
import { RegisterTenantDto } from "../dto/register-tenant.dto";
import {
  RegisterTenantResponseDto,
  RegisterUserResponseDto,
  LoginResponseDto,
  RefreshTokenResponseDto,
} from "../dto/dto-response/auth-response.dto";
import { UserService } from "../services/user.service";
import { UserResponseDto } from "../dto/dto-response/user-response.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingService: OnboardingService,
    private readonly userService: UserService
  ) {}

  /**
   * POST /auth/register/tenant
   * Company self-onboarding: creates Tenant + Settings + 3 default roles + Admin user.
   * Returns token pair so the admin is immediately authenticated.
   */
  @Public()
  @Post("register/tenant")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register a new company (tenant) and its first admin user" })
  @ApiSuccessResponse(RegisterTenantResponseDto, "Tenant and admin user registered successfully", {
    created: true,
  })
  async registerTenant(@Body() dto: RegisterTenantDto): Promise<ApiResponseDto<RegisterTenantResponseDto>> {
    const data = await this.onboardingService.registerTenant(dto);
    return { status: "success", data };
  }

  /**
   * POST /auth/register
   * Employee self-registration: join an existing company by tenantSlug.
   * Automatically assigned the 'Requestor' system role.
   */
  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Self-register as an employee of an existing company" })
  @ApiSuccessResponse(RegisterUserResponseDto, "User registered successfully", { created: true })
  async register(@Body() dto: RegisterDto): Promise<ApiResponseDto<RegisterUserResponseDto>> {
    const data = await this.onboardingService.registerUser(dto);
    return { status: "success", data };
  }

  /**
   * POST /auth/login
   * tenantId is passed as a header or extracted via a future tenant-resolver middleware.
   * For now, the consumer provides it in the request body extension or header.
   * Marked @Public() so the global JwtAuthGuard is skipped.
   */
  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authenticate and receive token pair" })
  @ApiSuccessResponse(LoginResponseDto, "User authenticated successfully")
  async login(@Body() dto: LoginDto): Promise<ApiResponseDto<LoginResponseDto>> {
    const data = await this.authService.login(dto);
    return { status: "success", data };
  }

  /**
   * POST /auth/refresh
   * Client sends the raw refresh token; a new token pair is returned (rotation).
   */
  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate refresh token and receive a new token pair" })
  @ApiSuccessResponse(RefreshTokenResponseDto, "Token refreshed successfully")
  @ApiBody({ schema: { example: { refreshToken: "550e8400-e29b-41d4-a716-446655440000" } } })
  async refresh(
    @Body("refreshToken", ParseUUIDPipe) refreshToken: string
  ): Promise<ApiResponseDto<RefreshTokenResponseDto>> {
    const data = await this.authService.refresh(refreshToken);
    return { status: "success", data };
  }

  /**
   * GET /auth/me
   * Client sends the raw refresh token; a new token pair is returned (rotation).
   */
  @ApiBearerAuth()
  @Get("me")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Return Current Logged In User" })
  @ApiSuccessResponse(UserResponseDto, "User retrieved successfully")
  async getCurrentUser(@CurrentUser() user: IJwtPayload): Promise<ApiResponseDto<UserResponseDto>> {
    const userEntity = await this.userService.findById(user.sub, user.tenantId);

    const data = UserResponseDto.fromEntity(userEntity);

    return { status: "success", data };
  }

  /**
   * POST /auth/logout
   * Revokes the active refresh token. Protected — requires a valid access token.
   */
  @ApiBearerAuth()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the current refresh token" })
  @ApiBody({ schema: { example: { refreshToken: "550e8400-e29b-41d4-a716-446655440000" } } })
  async logout(
    @Body("refreshToken", ParseUUIDPipe) refreshToken: string,
    @CurrentUser() _user: IJwtPayload,
    @TenantId() _tenantId: string
  ): Promise<void> {
    await this.authService.logout(refreshToken);
  }
}
