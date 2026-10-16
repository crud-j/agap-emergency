import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications' })
  async findAll(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
  ) {
    return this.notificationsService.findAll(
      req.user.id,
      page ? +page : 1,
      perPage ? +perPage : 20,
    );
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications read' })
  async markAllRead(@Request() req: any) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async unreadCount(@Request() req: any) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  @Post('register-token')
  @ApiOperation({ summary: 'Register a push notification token' })
  async registerToken(@Request() req: any, @Body() body: { fcmToken?: string; token?: string }) {
    const token = body.fcmToken ?? body.token ?? '';
    return this.notificationsService.registerToken(req.user.id, token);
  }

  @Delete('register-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove push notification token' })
  async removeToken(@Request() req: any) {
    await this.notificationsService.removeToken(req.user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification read' })
  async markRead(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.notificationsService.markRead(id, req.user.id);
  }
}
