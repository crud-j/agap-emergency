import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgapGateway } from './agap.gateway';
import { RealtimeService } from './realtime.service';
import { WsJwtGuard } from './ws-jwt.guard';
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
  ],
  providers: [AgapGateway, RealtimeService, WsJwtGuard],
  exports: [RealtimeService],
})
export class RealtimeModule {}
