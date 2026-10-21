import { BadRequestException, Controller, HttpCode, Post, Body, UseGuards, Request, Headers, Get, Delete, Param, ParseUUIDPipe, Ip, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { WebAuthnService } from './webauthn.service';
import { MfaService } from './mfa/mfa.service';
import { shapeSessionResponse } from './sessions/session-response';
import { authContextFromRequest } from './request-context';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { PasswordChangeAllowed } from './guards/password-change.guard';
import {
  REFRESH_COOKIE,
  SESSION_TTL_MS,
  isWebClient,
  refreshCookieOptions,
} from './sessions/session-cookie';
import { Public } from '../common/decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { GeoCheckDto } from './dto/geo-check.dto';
import { RegisterGuestDto } from './dto/register-guest.dto';
import { LoginPhoneDto } from './dto/login-phone.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { StepUpDto } from './dto/step-up.dto';
import { RequireRecentAuth } from '../common/decorators/recent-auth.decorator';
import { RecentAuthGuard } from '../common/guards/recent-auth.guard';
import { WebAuthnRegisterBeginDto } from './dto/webauthn-register-begin.dto';
import { WebAuthnRegisterCompleteDto } from './dto/webauthn-register-complete.dto';
import { WebAuthnAuthenticateBeginDto } from './dto/webauthn-authenticate-begin.dto';
import { WebAuthnAuthenticateCompleteDto } from './dto/webauthn-authenticate-complete.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly authService: AuthService,
    private readonly webAuthnService: WebAuthnService,
    private readonly mfa: MfaService,
    config: ConfigService,
  ) {
    this.cookieOptions = refreshCookieOptions(config);
  }

  /** See shapeSessionResponse: web gets the refresh cookie, mobile the body tokens. */
  private sessionResponse<T extends { accessToken: string; refreshToken: string; user: { id: string } }>(
    req: any,
    res: Response,
    session: T,
  ) {
    return shapeSessionResponse(this.authService, this.cookieOptions, req, res, session);
  }

  @Post('geo-check')
  @Public()
  @HttpCode(200)
  @Throttle({ burst: { ttl: 60000, limit: 20 }, sustained: { ttl: 900000, limit: 60 } })
  @ApiOperation({ summary: 'Check whether a GPS coordinate is inside Bocaue, Bulacan' })
  @ApiResponse({ status: 200, description: 'Inside/outside result' })
  async geoCheck(@Body() dto: GeoCheckDto) {
    return this.authService.checkGeoFence(dto.latitude, dto.longitude);
  }

  @Post('register')
  @Public()
  @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } })
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('register/guest')
  @Public()
  @ApiOperation({ summary: 'Create a short-lived guest reporter account' })
  async registerGuest(@Body() dto: RegisterGuestDto) {
    return this.authService.registerGuest(dto);
  }

  @Post('login')
  @Public()
  @UseGuards(AuthGuard('local'))
  @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } })
  @ApiOperation({ summary: 'Login with email/password' })
  async login(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const ctx = authContextFromRequest(req);
    // The password was accepted. Staff roles may still owe a second step (or first-time
    // enrollment); everyone else — citizens, bystanders, responders — gets a session as before.
    const decision = await this.mfa.evaluateLogin(req.user, ctx);
    if (decision.kind === 'challenge') {
      res.status(200);
      return decision.challenge;
    }
    const session = await this.authService.login(req.user, ctx, 'password', decision.amr);
    return this.sessionResponse(req, res, session);
  }

  @Post('login/phone')
  @Public()
  @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } })
  @ApiOperation({ summary: 'Request a phone OTP — sends SMS to the registered number' })
  async loginPhone(@Body() dto: LoginPhoneDto) {
    return this.authService.loginPhone(dto.phoneNumber);
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Rotate access + refresh tokens' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const web = isWebClient(req);
    // Web: the cookie only, and only with the X-AGAP-Client header (CSRF guard).
    // Mobile: the body token only — a stray cookie is never honoured without the header.
    const token: string | undefined = web ? req.cookies?.[REFRESH_COOKIE] : dto.refreshToken;
    try {
      if (!token) throw new UnauthorizedException('Invalid or expired refresh token');
      const { accessToken, refreshToken, userId } = await this.authService.refreshToken(token);
      if (!web) return { accessToken, refreshToken };
      res.cookie(REFRESH_COOKIE, refreshToken, { ...this.cookieOptions, maxAge: SESSION_TTL_MS });
      return { accessToken, user: await this.authService.getSessionUser(userId) };
    } catch (err) {
      // A dead cookie is useless — drop it so middleware stops treating the browser as signed in.
      if (web) res.clearCookie(REFRESH_COOKIE, this.cookieOptions);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(200)
  @PasswordChangeAllowed()
  // Optional: an expired access token must not stop someone from signing out.
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke current session' })
  async logout(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: RefreshTokenDto,
    @Headers('authorization') auth?: string,
  ) {
    const web = isWebClient(req);
    const result = await this.authService.logout(
      {
        userId: req.user?.id,
        sessionId: req.user?.sid,
        accessToken: req.user ? auth?.replace('Bearer ', '') : undefined,
        refreshToken: web ? req.cookies?.[REFRESH_COOKIE] : dto.refreshToken,
      },
      authContextFromRequest(req),
    );
    if (web) res.clearCookie(REFRESH_COOKIE, this.cookieOptions);
    return result;
  }

  @Post('step-up')
  @UseGuards(JwtAuthGuard)
  @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Re-authenticate the current session for a sensitive action' })
  async stepUp(@Body() dto: StepUpDto, @Request() req: any) {
    return this.authService.stepUp(req.user.id, req.user.sid, dto.password, authContextFromRequest(req));
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for the current user' })
  async sessions(@Request() req: any) {
    return this.authService.listSessions(req.user.id, req.user.sid);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard, RecentAuthGuard)
  @RequireRecentAuth()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke one session for the current user' })
  async revokeSession(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.authService.revokeSession(req.user.id, id, authContextFromRequest(req));
  }

  @Post('verify/email')
  @Public()
  @ApiOperation({ summary: 'Verify email with OTP' })
  async verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp({ ...dto, type: 'EMAIL' });
  }

  @Post('verify/phone')
  @Public()
  @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } })
  @ApiOperation({ summary: 'Submit phone OTP to complete login — returns accessToken + refreshToken' })
  async verifyPhone(@Body() dto: LoginPhoneDto) {
    if (!dto.otp) throw new BadRequestException('otp is required');
    return this.authService.verifyPhoneOtp(dto.phoneNumber, dto.otp);
  }

  @Post('forgot-password')
  @Public()
  @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } })
  @ApiOperation({ summary: 'Request a password reset token' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } })
  @ApiOperation({ summary: 'Reset password with token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @PasswordChangeAllowed()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (authenticated)' })
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto, req.user.sid);
  }

  // ---------------------------------------------------------------------------
  // Passkey / WebAuthn endpoints
  // ---------------------------------------------------------------------------

  @Post('passkey/register/begin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Begin passkey registration ceremony — returns options for the browser WebAuthn API' })
  @ApiResponse({ status: 201, description: 'Registration options generated' })
  async passkeyRegisterBegin(
    @Request() req: any,
    @Body() dto: WebAuthnRegisterBeginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    // deviceLabel is accepted for API compatibility; it is persisted on /complete.
    void dto;
    return this.webAuthnService.beginRegistration(req.user.id, ip, userAgent);
  }

  @Post('passkey/register/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete passkey registration — verifies authenticator response and stores credential' })
  @ApiResponse({ status: 201, description: 'Passkey registered' })
  async passkeyRegisterComplete(
    @Request() req: any,
    @Body() dto: WebAuthnRegisterCompleteDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.webAuthnService.completeRegistration(
      req.user.id,
      dto.challengeId,
      dto.response,
      dto.deviceLabel,
      ip,
      userAgent,
    );
  }

  @Post('passkey/authenticate/begin')
  @Public()
  @Throttle({ burst: { ttl: 60000, limit: 10 }, sustained: { ttl: 900000, limit: 30 } })
  @ApiOperation({ summary: 'Begin passkey authentication ceremony — returns options for the browser WebAuthn API' })
  @ApiResponse({ status: 201, description: 'Authentication options generated' })
  async passkeyAuthenticateBegin(
    @Body() dto: WebAuthnAuthenticateBeginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.webAuthnService.beginAuthentication(dto.identifier, ip, userAgent);
  }

  @Post('passkey/authenticate/complete')
  @Public()
  @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } })
  @ApiOperation({ summary: 'Complete passkey authentication — verifies authenticator response and returns JWT tokens' })
  @ApiResponse({ status: 201, description: 'Authenticated via passkey' })
  async passkeyAuthenticateComplete(
    @Body() dto: WebAuthnAuthenticateCompleteDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const session = await this.webAuthnService.completeAuthentication(
      dto.challengeId,
      dto.response,
      ip,
      userAgent,
    );
    return this.sessionResponse(req, res, session);
  }

  @Get('passkey/credentials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all active passkeys registered for the current user' })
  async passkeyListCredentials(@Request() req: any) {
    return this.webAuthnService.listCredentials(req.user.id);
  }

  @Delete('passkey/credentials/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a registered passkey' })
  async passkeyRevokeCredential(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) credentialId: string,
    @Ip() ip: string,
  ) {
    return this.webAuthnService.revokeCredential(req.user.id, credentialId, ip);
  }
}
