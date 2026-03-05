import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@app/shared/decorators/public.decorator";
import { CurrentUser } from "@app/shared/decorators/current-user.decorator";
import { TenantId } from "@app/shared/decorators/tenant-id.decorator";
import { IJwtPayload } from "@app/shared/interfaces/jwt-payload.interface";
import { AuthService } from "../services/auth.service";
import { OnboardingService } from "../services/onboarding.service";
import { LoginDto } from "../dto/login.dto";
import { RegisterDto } from "../dto/register.dto";
import { RegisterTenantDto } from "../dto/register-tenant.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingService: OnboardingService
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
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.onboardingService.registerTenant(dto);
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
  register(@Body() dto: RegisterDto) {
    return this.onboardingService.registerUser(dto);
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
  login(@Body() dto: LoginDto, @Body("tenantId") tenantId: string) {
    return this.authService.login(dto, tenantId);
  }

  /**
   * POST /auth/refresh
   * Client sends the raw refresh token; a new token pair is returned (rotation).
   */
  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate refresh token and receive a new token pair" })
  refresh(@Body("refreshToken") refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  /**
   * POST /auth/logout
   * Revokes the active refresh token. Protected — requires a valid access token.
   */
  @ApiBearerAuth()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the current refresh token" })
  logout(
    @Body("refreshToken") refreshToken: string,
    @CurrentUser() _user: IJwtPayload,
    @TenantId() _tenantId: string
  ) {
    return this.authService.logout(refreshToken);
  }
}
