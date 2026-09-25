import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OfflineSyncService } from './offline-sync.service';
import { SyncBatchDto } from './dto/sync-batch.dto';
import { FlushBatchDto } from './dto/flush-batch.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@ApiTags('offline-sync')
@Controller({ path: 'offline-sync', version: '1' })
export class OfflineSyncController {
  constructor(private readonly offlineSyncService: OfflineSyncService) {}

  @Post('sync')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Flush a batch of offline-queued events (idempotent)' })
  async sync(@Body() dto: SyncBatchDto, @Request() req: any) {
    return this.offlineSyncService.syncBatch(dto.events, req.user?.id);
  }

  @Post('flush')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Flush offline events as a single atomic batch job (idempotent)' })
  async flush(@Body() dto: FlushBatchDto, @Request() req: any) {
    return this.offlineSyncService.flush(
      dto.events.map((e) => ({ clientEventId: e.client_event_id, type: e.type, payload: e.payload })),
      req.user?.id,
    );
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my offline sync queue status' })
  async status(@Request() req: any) {
    return this.offlineSyncService.getStatus(req.user.id);
  }
}
