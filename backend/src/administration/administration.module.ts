import { Module } from '@nestjs/common';
import { AdministrationController } from './administration.controller';
import { AdministrationService } from './administration.service';
import { AuditModule } from '../audit/audit.module';
import { SessionsModule } from '../auth/sessions/sessions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditModule, SessionsModule, AuthModule],
  controllers: [AdministrationController],
  providers: [AdministrationService],
  exports: [AdministrationService],
})
export class AdministrationModule {}
