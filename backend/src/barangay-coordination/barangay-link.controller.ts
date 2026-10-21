import {
  Body,
  Controller,
  Get,
  GoneException,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import {
  BarangayCallbackNotFoundError,
  BarangayCallbackRefusedError,
  BarangayCallbackService,
} from './barangay-callback.service';
import { LinkReportDto } from './dto/barangay-callback.dto';

/**
 * The barangay status page. No login: the access code from the alert SMS (or an older
 * link token) is the credential, it only reaches one notice, and a closed case reveals
 * nothing. Every failure to match is the same 404, and the throttle keeps codes from
 * being guessed.
 */
@ApiTags('barangay-coordination')
@Controller({ path: 'public/barangay', version: '1' })
export class BarangayLinkController {
  constructor(private readonly callbacks: BarangayCallbackService) {}

  @Get(':token')
  @Public()
  @Throttle({ burst: { ttl: 60000, limit: 30 }, sustained: { ttl: 900000, limit: 120 } })
  @ApiOperation({ summary: 'Barangay status page data (location, case, current status)' })
  async view(@Param('token') token: string) {
    const view = await this.callbacks.viewByLink(token);
    if (!view) throw new NotFoundException('This link is not valid');
    return view;
  }

  @Post(':token/report')
  @Public()
  @HttpCode(200)
  @Throttle({ burst: { ttl: 60000, limit: 10 }, sustained: { ttl: 900000, limit: 60 } })
  @ApiOperation({ summary: 'Barangay taps a status: seen, acting, on scene, completed, needs backup' })
  async report(@Param('token') token: string, @Body() dto: LinkReportDto) {
    try {
      return await this.callbacks.reportByLink(token, dto.status);
    } catch (err) {
      if (err instanceof BarangayCallbackNotFoundError) throw new NotFoundException('This link is not valid');
      if (err instanceof BarangayCallbackRefusedError) throw new GoneException(err.message);
      throw err;
    }
  }
}
