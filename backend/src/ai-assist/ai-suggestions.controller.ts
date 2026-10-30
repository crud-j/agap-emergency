import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@agap/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AiSuggestionsService } from './ai-suggestions.service';

/** AI Assist suggestions: ops roles only (the System Administrator has no operational powers). */
@ApiTags('ai-assist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
@Controller({ version: '1' })
export class AiSuggestionsController {
  constructor(private readonly suggestions: AiSuggestionsService) {}

  @Get('incidents/:id/ai-suggestions')
  @ApiOperation({ summary: 'Open AI suggestions for an incident (review or information only)' })
  async list(@Param('id', ParseUUIDPipe) id: string) {
    return this.suggestions.listForIncident(id);
  }

  @Post('ai-suggestions/:sid/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept an AI suggestion: records it as the barangay report (audited)' })
  async accept(@Param('sid', ParseUUIDPipe) sid: string, @Request() req: any) {
    return this.suggestions.accept(sid, { id: req.user.id, role: req.user.role });
  }

  @Post('ai-suggestions/:sid/dismiss')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dismiss an AI suggestion (audited)' })
  async dismiss(@Param('sid', ParseUUIDPipe) sid: string, @Request() req: any) {
    return this.suggestions.dismiss(sid, { id: req.user.id, role: req.user.role });
  }
}
