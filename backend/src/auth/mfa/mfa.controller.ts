import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Request, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../guards/optional-jwt-auth.guard';
import { authContextFromRequest } from '../request-context';
import { refreshCookieOptions } from '../sessions/session-cookie';
import { shapeSessionResponse } from '../sessions/session-response';
import {
  MfaConfirmDto,
  MfaEnrollDto,
  MfaPasskeyCompleteDto,
  MfaPasswordDto,
  MfaTokenDto,
  MfaVerifyDto,
} from './dto/mfa.dto';
import { MfaService } from './mfa.service';
import { TRUSTED_DEVICE_COOKIE, TRUSTED_DEVICE_TTL_MS } from './mfa.constants';
import { RequireRecentAuth } from '../../common/decorators/recent-auth.decorator';
import { RecentAuthGuard } from '../../common/guards/recent-auth.guard';

/** 5 per minute and 10 per 15 minutes: the plan's limit for every code-verification endpoint. */
const CODE_THROTTLE = { burst: { ttl: 60_000, limit: 5 }, sustained: { ttl: 900_000, limit: 10 } };

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class MfaController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly mfa: MfaService,
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.cookieOptions = refreshCookieOptions(config);
  }

  private setTrustedCookie(res: Response, trusted: { token: string } | null): void {
    if (!trusted) return;
    res.cookie(TRUSTED_DEVICE_COOKIE, trusted.token, { ...this.cookieOptions, maxAge: TRUSTED_DEVICE_TTL_MS });
  }

  @Post('mfa/verify')
  @Public()
  @Throttle(CODE_THROTTLE)
  @ApiOperation({ summary: 'Second step of sign-in: authenticator code, backup code or SMS code' })
  async verify(@Body() dto: MfaVerifyDto, @Request() req: any, @Res({ passthrough: true }) res: Response) {
    const { session, trusted } = await this.mfa.verify(dto, authContextFromRequest(req));
    this.setTrustedCookie(res, trusted);
    return shapeSessionResponse(this.authService, this.cookieOptions, req, res, session);
  }

  @Post('mfa/sms/send')
  @Public()
  @Throttle(CODE_THROTTLE)
  @ApiOperation({ summary: 'Send an SMS sign-in code (only when AUTH_SMS_MFA_ENABLED)' })
  sendSms(@Body() dto: MfaTokenDto) {
    return this.mfa.sendSmsCode(dto.mfaToken);
  }

  @Post('mfa/passkey/begin')
  @Public()
  @Throttle(CODE_THROTTLE)
  @ApiOperation({ summary: 'Begin a passkey ceremony as the second step of sign-in' })
  passkeyBegin(@Body() dto: MfaTokenDto, @Request() req: any) {
    return this.mfa.passkeyBegin(dto.mfaToken, authContextFromRequest(req));
  }

  @Post('mfa/passkey/complete')
  @Public()
  @Throttle(CODE_THROTTLE)
  @ApiOperation({ summary: 'Complete the passkey second step and receive the session' })
  async passkeyComplete(
    @Body() dto: MfaPasskeyCompleteDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session, trusted } = await this.mfa.passkeyComplete(dto, authContextFromRequest(req));
    this.setTrustedCookie(res, trusted);
    return shapeSessionResponse(this.authService, this.cookieOptions, req, res, session);
  }

  @Post('mfa/totp/enroll')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle(CODE_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start authenticator-app enrollment (signed in, or with an enrollment mfaToken)' })
  async totpEnroll(@Body() dto: MfaEnrollDto, @Request() req: any) {
    const principal = await this.mfa.resolvePrincipal(req.user || undefined, dto.mfaToken);
    return this.mfa.startTotpEnrollment(principal);
  }

  @Post('mfa/totp/confirm')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle(CODE_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm the first code; returns backup codes once (and the session on forced enrollment)' })
  async totpConfirm(
    @Body() dto: MfaConfirmDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = authContextFromRequest(req);
    const principal = await this.mfa.resolvePrincipal(req.user || undefined, dto.mfaToken);
    const { backupCodes, session } = await this.mfa.confirmTotp(principal, dto.code, ctx);
    if (!session) return { backupCodes };
    return { ...(await shapeSessionResponse(this.authService, this.cookieOptions, req, res, session)), backupCodes };
  }

  @Post('mfa/backup-codes/regenerate')
  @UseGuards(JwtAuthGuard, RecentAuthGuard)
  @RequireRecentAuth()
  @Throttle(CODE_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Replace the backup codes (password required); old codes stop working' })
  regenerateBackupCodes(@Body() dto: MfaPasswordDto, @Request() req: any) {
    return this.mfa.regenerateBackupCodes(req.user.id, dto.password, authContextFromRequest(req));
  }

  @Delete('mfa/totp')
  @UseGuards(JwtAuthGuard, RecentAuthGuard)
  @RequireRecentAuth()
  @Throttle(CODE_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove the authenticator app (password required)' })
  removeTotp(@Body() dto: MfaPasswordDto, @Request() req: any) {
    return this.mfa.removeTotp(req.user.id, dto.password, authContextFromRequest(req));
  }

  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Which second factors the signed-in user has, and their trusted browsers' })
  status(@Request() req: any) {
    return this.mfa.status(req.user.id, authContextFromRequest(req).trustedDeviceToken);
  }

  @Delete('trusted-devices/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stop trusting one browser' })
  revokeTrustedDevice(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.mfa.revokeTrustedDevice(req.user.id, id, authContextFromRequest(req));
  }
}
