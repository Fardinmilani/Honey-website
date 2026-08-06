import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  IdentityService,
  PERMISSION_CODES,
  ROLE_CODES,
  randomOpaqueToken,
  type SafeUser,
  type SessionResult,
  type SessionSummary,
} from '@honey/backend';
import type { ApiConfig } from '../../config/api-config.js';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';
import { Public, RequirePermissions } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';

class RegisterDto {
  @ApiProperty({ type: String, format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ type: String, format: 'password', minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10)
  @MaxLength(256)
  password!: string;

  @ApiPropertyOptional({ type: String, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ type: String, enum: ['fa', 'en'], default: 'fa' })
  @IsOptional()
  @IsIn(['fa', 'en'])
  preferredLocale?: string;
}

class LoginDto {
  @ApiProperty({ type: String, format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ type: String, format: 'password' })
  @IsString()
  @MaxLength(256)
  password!: string;
}

class EmailDto {
  @ApiProperty({ type: String, format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

class TokenDto {
  @ApiProperty({ type: String, minLength: 32, maxLength: 256 })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}

class PasswordResetConfirmDto extends TokenDto {
  @ApiProperty({ type: String, format: 'password', minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10)
  @MaxLength(256)
  newPassword!: string;
}

class TotpConfirmDto {
  @ApiProperty({ type: String, pattern: '^\\d{6}$' })
  @Matches(/^\d{6}$/u)
  code!: string;
}

class SessionParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  sessionId!: string;
}

class AcceptedResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  accepted!: true;
}

class SafeUserDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'email' })
  email!: string;

  @ApiProperty({ type: Boolean })
  emailVerified!: boolean;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, example: 'fa' })
  preferredLocale!: string;

  @ApiProperty({ type: String, enum: ['ACTIVE', 'SUSPENDED', 'DELETED'] })
  status!: string;

  @ApiProperty({ type: Boolean })
  isStaff!: boolean;

  @ApiProperty({ type: [String], enum: ROLE_CODES })
  roles!: readonly string[];

  @ApiProperty({ type: [String], enum: PERMISSION_CODES })
  permissions!: readonly string[];
}

class AuthenticatedResponseDto {
  @ApiProperty({ type: String, enum: ['AUTHENTICATED'] })
  next!: 'AUTHENTICATED';

  @ApiProperty({ type: SafeUserDto })
  user!: SafeUserDto;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: String, description: 'Double-submit value for X-CSRF-Token.' })
  csrfToken!: string;
}

class LoginResponseDto {
  @ApiProperty({
    type: String,
    enum: ['AUTHENTICATED', 'TOTP_REQUIRED', 'TOTP_ENROLLMENT_REQUIRED'],
  })
  next!: 'AUTHENTICATED' | 'TOTP_REQUIRED' | 'TOTP_ENROLLMENT_REQUIRED';

  @ApiPropertyOptional({ type: SafeUserDto })
  user?: SafeUserDto;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  expiresAt?: string;

  @ApiPropertyOptional({ type: String })
  csrfToken?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Controlled TOTP enrollment URI; returned only after a valid staff password.',
  })
  provisioningUri?: string;
}

class SessionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, enum: ['CUSTOMER', 'STAFF'] })
  kind!: string;

  @ApiProperty({ type: Boolean })
  current!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  lastSeenAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: String, nullable: true })
  ip!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userAgentHash!: string | null;
}

class SessionsResponseDto {
  @ApiProperty({ type: [SessionDto] })
  sessions!: readonly SessionDto[];
}

function safeUserDto(user: SafeUser): SafeUserDto {
  return { ...user };
}

@ApiTags('Identity')
@Controller('v1')
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject('API_CONFIG') private readonly config: ApiConfig,
  ) {}

  @Post('auth/register')
  @Public()
  @HttpCode(202)
  @ApiOperation({
    operationId: 'registerCustomer',
    summary: 'Register a customer account',
    description:
      'Creates only a CUSTOMER account and sends a one-time verification email when accepted.',
  })
  @ApiAcceptedResponse({ type: AcceptedResponseDto, description: 'Registration was accepted.' })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async register(
    @Body() input: RegisterDto,
    @Req() request: FastifyRequest,
  ): Promise<AcceptedResponseDto> {
    return this.identity.register(input, requestMetadata(request));
  }

  @Post('auth/login')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'login',
    summary: 'Authenticate with email and password',
    description:
      'Creates a customer session or a short-lived staff TOTP challenge after generic credential validation.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async login(
    @Body() input: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponseDto> {
    const result = await this.identity.login(input, requestMetadata(request));
    if (result.next === 'AUTHENTICATED') return this.#authenticated(result.session, reply);
    this.#setChallengeCookie(reply, result.challengeToken, result.challengeExpiresAt);
    return result.next === 'TOTP_REQUIRED'
      ? { next: result.next }
      : { next: result.next, provisioningUri: result.provisioningUri };
  }

  @Post('auth/staff/totp/confirm')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'confirmStaffTotp',
    summary: 'Complete staff TOTP authentication',
    description:
      'Consumes the pre-authentication cookie and creates a staff session only after valid TOTP verification.',
  })
  @ApiOkResponse({ type: AuthenticatedResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  async confirmStaffTotp(
    @Body() input: TotpConfirmDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthenticatedResponseDto> {
    const session = await this.identity.completeStaffTotp(
      request.cookies[this.#challengeCookieName()] ?? '',
      input.code,
      requestMetadata(request),
    );
    this.#clearChallengeCookie(reply);
    return this.#authenticated(session, reply);
  }

  @Post('auth/logout')
  @RequirePermissions()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'logout',
    summary: 'Revoke the current session',
    description:
      'Revokes the server-side session before clearing the matching authentication cookies.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.identity.logout(requestPrincipal(request), requestMetadata(request));
    this.#clearAuthenticationCookies(reply);
  }

  @Post('auth/logout-all')
  @RequirePermissions()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'logoutAll',
    summary: 'Revoke every active session',
    description: 'Immediately revokes every active session owned by the authenticated account.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async logoutAll(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.identity.logoutAll(requestPrincipal(request), requestMetadata(request));
    this.#clearAuthenticationCookies(reply);
  }

  @Post('auth/email-verification/request')
  @Public()
  @HttpCode(202)
  @ApiOperation({
    operationId: 'requestEmailVerification',
    summary: 'Request email verification',
    description:
      'Returns the same accepted response regardless of whether an eligible account exists.',
  })
  @ApiAcceptedResponse({ type: AcceptedResponseDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  requestEmailVerification(@Body() input: EmailDto): Promise<AcceptedResponseDto> {
    return this.identity.requestEmailVerification(input.email);
  }

  @Post('auth/email-verification/confirm')
  @Public()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'confirmEmailVerification',
    summary: 'Confirm email verification',
    description:
      'Consumes one valid, unexpired verification token and atomically marks the email verified.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  confirmEmailVerification(@Body() input: TokenDto, @Req() request: FastifyRequest): Promise<void> {
    return this.identity.confirmEmailVerification(input.token, requestMetadata(request));
  }

  @Post('auth/password-reset/request')
  @Public()
  @HttpCode(202)
  @ApiOperation({
    operationId: 'requestPasswordReset',
    summary: 'Request a password reset',
    description: 'Rate-limits the request and returns an enumeration-safe accepted response.',
  })
  @ApiAcceptedResponse({ type: AcceptedResponseDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  @ApiTooManyRequestsResponse({ type: ProblemDetailsDto })
  requestPasswordReset(
    @Body() input: EmailDto,
    @Req() request: FastifyRequest,
  ): Promise<AcceptedResponseDto> {
    return this.identity.requestPasswordReset(input.email, requestMetadata(request));
  }

  @Post('auth/password-reset/confirm')
  @Public()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'confirmPasswordReset',
    summary: 'Confirm a password reset',
    description:
      'Consumes one reset token, replaces the Argon2id credential, and revokes existing sessions.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  confirmPasswordReset(
    @Body() input: PasswordResetConfirmDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.identity.confirmPasswordReset(
      input.token,
      input.newPassword,
      requestMetadata(request),
    );
  }

  @Get('me')
  @RequirePermissions()
  @ApiOperation({
    operationId: 'getMe',
    summary: 'Get the authenticated account',
    description:
      'Returns only the safe account and effective authorization summary for the current principal.',
  })
  @ApiOkResponse({ type: SafeUserDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async me(@Req() request: FastifyRequest): Promise<SafeUserDto> {
    return safeUserDto(await this.identity.me(requestPrincipal(request)));
  }

  @Get('me/sessions')
  @RequirePermissions()
  @ApiOperation({
    operationId: 'listMySessions',
    summary: 'List active sessions for this account',
    description: 'Lists only active sessions owned by the authenticated account.',
  })
  @ApiOkResponse({ type: SessionsResponseDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async listSessions(@Req() request: FastifyRequest): Promise<SessionsResponseDto> {
    const sessions: readonly SessionSummary[] = await this.identity.listSessions(
      requestPrincipal(request),
    );
    return { sessions };
  }

  @Delete('me/sessions/:sessionId')
  @RequirePermissions()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'revokeMySession',
    summary: 'Revoke one of this account’s sessions',
    description:
      'Revokes an owned session and returns not found for a session owned by another account.',
  })
  @ApiParam({ name: 'sessionId', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async revokeSession(
    @Param() params: SessionParamDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const principal = requestPrincipal(request);
    await this.identity.revokeSession(principal, params.sessionId, requestMetadata(request));
    if (params.sessionId === principal.sessionId) this.#clearAuthenticationCookies(reply);
  }

  #authenticated(session: SessionResult, reply: FastifyReply): AuthenticatedResponseDto {
    const csrfToken = randomOpaqueToken();
    reply.setCookie(this.config.sessionCookie.name, session.sessionToken, {
      httpOnly: true,
      secure: this.config.sessionCookie.secure,
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
    reply.setCookie(this.config.csrf.cookieName, csrfToken, {
      httpOnly: false,
      secure: this.config.csrf.secureCookie,
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
    return {
      next: 'AUTHENTICATED',
      user: safeUserDto(session.user),
      expiresAt: session.expiresAt.toISOString(),
      csrfToken,
    };
  }

  #challengeCookieName(): string {
    return this.config.sessionCookie.secure ? '__Host-staff-challenge' : 'honey_staff_challenge';
  }

  #setChallengeCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
    reply.setCookie(this.#challengeCookieName(), token, {
      httpOnly: true,
      secure: this.config.sessionCookie.secure,
      sameSite: 'strict',
      path: '/',
      expires: expiresAt,
    });
  }

  #clearChallengeCookie(reply: FastifyReply): void {
    reply.clearCookie(this.#challengeCookieName(), {
      httpOnly: true,
      secure: this.config.sessionCookie.secure,
      sameSite: 'strict',
      path: '/',
    });
  }

  #clearAuthenticationCookies(reply: FastifyReply): void {
    reply.clearCookie(this.config.sessionCookie.name, {
      httpOnly: true,
      secure: this.config.sessionCookie.secure,
      sameSite: 'lax',
      path: '/',
    });
    reply.clearCookie(this.config.csrf.cookieName, {
      httpOnly: false,
      secure: this.config.csrf.secureCookie,
      sameSite: 'lax',
      path: '/',
    });
  }
}
