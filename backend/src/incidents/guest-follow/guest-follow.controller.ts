import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { GUEST_REPORT_TOKEN_HEADER } from '@agap/shared';
import { Public } from '../../common/decorators/public.decorator';
import { GuestFollowService } from './guest-follow.service';

export class GuestPushTokenDto {
  /** The device's FCM token; null stops push updates for this report. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_:\-.]+$/)
  pushToken!: string | null;
}

/**
 * A guest following their own report from the phone that sent it (MOD-42, Rule 14).
 * No account: the token from POST /v1/incidents, sent in a header, is the only key.
 */
@ApiTags('incidents')
@Controller({ path: 'guest-reports', version: '1' })
export class GuestFollowController {
  constructor(private readonly guestFollow: GuestFollowService) {}

  @Get('status')
  @Public()
  // The app polls every 15 s while the screen is open.
  @Throttle({ burst: { ttl: 1000, limit: 3 }, sustained: { ttl: 60000, limit: 30 } })
  @ApiHeader({ name: GUEST_REPORT_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: "A guest's own report status (status words only)" })
  @ApiResponse({ status: 401, description: 'Unknown or expired token' })
  status(@Headers(GUEST_REPORT_TOKEN_HEADER) token?: string) {
    return this.guestFollow.status(token);
  }

  @Put('push-token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ burst: { ttl: 1000, limit: 2 }, sustained: { ttl: 60000, limit: 10 } })
  @ApiHeader({ name: GUEST_REPORT_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Turn push updates for a guest report on (device token) or off (null)' })
  @ApiResponse({ status: 401, description: 'Unknown or expired token' })
  setPushToken(@Headers(GUEST_REPORT_TOKEN_HEADER) token: string | undefined, @Body() dto: GuestPushTokenDto) {
    return this.guestFollow.setPushToken(token, dto.pushToken ?? null);
  }
}
