import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConsentService } from './consent.service';
import { CreateConsentDto } from './dto/create-consent.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('consent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'consent', version: '1' })
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Post()
  @ApiOperation({ summary: 'Grant a consent' })
  async grant(@Request() req: any, @Body() dto: CreateConsentDto) {
    return this.consentService.grantConsent(req.user.id, dto);
  }

  @Delete(':type')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Withdraw a consent' })
  async revoke(@Param('type') type: string, @Request() req: any) {
    await this.consentService.revokeConsent(req.user.id, type);
  }

  @Get(':type')
  @ApiOperation({ summary: 'Check consent status' })
  async check(@Param('type') type: string, @Request() req: any) {
    return this.consentService.checkConsent(req.user.id, type);
  }
}
