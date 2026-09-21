import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CommunicationsService } from './communications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('communications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'communications', version: '1' })
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get(':incidentId')
  @ApiOperation({ summary: 'Get incident messages' })
  async getMessages(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Request() req: any,
  ) {
    return this.communicationsService.getMessages(incidentId, req.user.id);
  }

  @Post(':incidentId')
  @ApiOperation({ summary: 'Send an incident message' })
  async sendMessage(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: { messageText: string; attachmentId?: string },
    @Request() req: any,
  ) {
    return this.communicationsService.sendMessage(incidentId, dto, req.user.id);
  }

  @Patch(':incidentId/messages/:messageId/read')
  @ApiOperation({ summary: 'Mark an incident message as read' })
  async markRead(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Request() req: any,
  ) {
    return this.communicationsService.markRead(messageId, req.user.id);
  }
}
