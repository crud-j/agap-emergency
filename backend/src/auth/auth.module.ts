import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from '@agap/shared';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { WebAuthnService } from './webauthn.service';
import { WellKnownController } from './well-known.controller';
import { AuditModule } from '../audit/audit.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';

@Module({
  imports: [
    PassportModule,
    AuditModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SMS }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  controllers: [AuthController, WellKnownController],
  providers: [AuthService, WebAuthnService, JwtStrategy, LocalStrategy, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [AuthService, WebAuthnService, JwtAuthGuard, OptionalJwtAuthGuard],
})
export class AuthModule {}
