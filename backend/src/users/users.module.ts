import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuditModule } from '../audit/audit.module';
import { SessionsModule } from '../auth/sessions/sessions.module';
import { MediaModule } from '../media/media.module';
import { ProfilePhotoService } from './profile-photo/profile-photo.service';
import { PhotoContentCheckService } from './profile-photo/photo-content-check.service';

@Module({
  imports: [AuditModule, SessionsModule, MediaModule],
  controllers: [UsersController],
  providers: [UsersService, ProfilePhotoService, PhotoContentCheckService],
  exports: [UsersService],
})
export class UsersModule {}
