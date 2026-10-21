import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgapGateway } from './agap.gateway';
import { RealtimeService } from './realtime.service';
import { SessionsModule } from '../auth/sessions/sessions.module';
import { WsJwtGuard } from './ws-jwt.guard';
import { IncidentParticipantService } from './incident-participant.service';
import { PrismaModule } from '../common/prisma/prisma.module';

/**
 * Global so any feature module can inject RealtimeService without importing
 * RealtimeModule — avoids per-module import edges and the circular-dependency
 * risk that would arise if realtime had to import the feature modules back.
 * WebSocket is distribution ONLY; PostgreSQL remains the source of truth.
 */
@Global()
@Module({
  imports: [
    JwtModule.register({}),
    PrismaModule,
    SessionsModule,
  ],
  providers: [AgapGateway, RealtimeService, WsJwtGuard, IncidentParticipantService],
  exports: [RealtimeService, IncidentParticipantService],
})
export class RealtimeModule {}
