import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrivacyService } from './privacy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('privacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'privacy', version: '1' })
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get('access-log')
  @ApiOperation({ summary: 'Get my sensitive-data access log' })
  async getAccessLog(@Request() req: any) {
    return this.privacyService.getAccessLog(req.user.id);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export my personal data' })
  async exportData(@Request() req: any) {
    return this.privacyService.exportData(req.user.id);
  }
}
