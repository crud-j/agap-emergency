import {
  BadRequestException,
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Headers,
  Get,
  Delete,
  Param,
  ParseUUIDPipe,
  Ip,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { WebAuthnService } from './webauthn.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { RegisterGuestDto } from './dto/register-guest.dto';
import { LoginPhoneDto } from './dto/login-phone.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { WebAuthnRegisterBeginDto } from './dto/webauthn-register-begin.dto';
import { WebAuthnRegisterCompleteDto } from './dto/webauthn-register-complete.dto';
import { WebAuthnAuthenticateBeginDto } from './dto/webauthn-authenticate-begin.dto';
import { WebAuthnAuthenticateCompleteDto } from './dto/webauthn-authenticate-complete.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly webAuthnService: WebAuthnService,
  ) {}

  private readonly refreshCookieName = 'agap_refresh_token';

  private refreshCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';

    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict' as const,
      path: '/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
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
  async login(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(req.user);
    const { refreshToken, ...response } = result;

    res.cookie(
      this.refreshCookieName,
      refreshToken,
      this.refreshCookieOptions(),
    );

    return response;
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
    @Request() req: any,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      req.cookies?.[this.refreshCookieName] ?? dto?.refreshToken;

    if (!refreshToken) {
      res.clearCookie(this.refreshCookieName, this.refreshCookieOptions());
      throw new UnauthorizedException('Refresh token is missing');
    }

    const result = await this.authService.refreshToken(refreshToken);
    const { refreshToken: newRefreshToken, ...response } = result;

    res.cookie(
      this.refreshCookieName,
      newRefreshToken,
      this.refreshCookieOptions(),
    );

    return response;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke current session' })
  async logout(
    @Request() req: any,
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = auth?.replace(/^Bearer\s+/i, '');

    const result = await this.authService.logout(req.user.id, token);

    res.clearCookie(this.refreshCookieName, this.refreshCookieOptions());

    return result;
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (authenticated)' })
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
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
  @ApiOperation({ summary: 'Complete passkey authentication ceremony — verifies authenticator response and returns JWT tokens' })
  @ApiResponse({ status: 201, description: 'Authenticated via passkey' })
  async passkeyAuthenticateComplete(
    @Body() dto: WebAuthnAuthenticateCompleteDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.webAuthnService.completeAuthentication(dto.challengeId, dto.response, ip, userAgent);
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
