import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionRevocationService } from './session-revocation.service';

/**
 * Session revocation, kept separate from AuthModule so Realtime, Administration
 * and Users can depend on it without pulling in passport / JWT strategies.
 */
@Module({
  imports: [ConfigModule],
  providers: [SessionRevocationService],
  exports: [SessionRevocationService],
})
export class SessionsModule {}
