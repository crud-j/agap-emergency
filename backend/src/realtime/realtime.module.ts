import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgapGateway } from './agap.gateway';
import { RealtimeService } from './realtime.service';
import { WsJwtGuard } from './ws-jwt.guard';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [
    JwtModule.register({}),
    PrismaModule,
  ],
  providers: [AgapGateway, RealtimeService, WsJwtGuard],
  exports: [RealtimeService],
})
export class RealtimeModule {}
