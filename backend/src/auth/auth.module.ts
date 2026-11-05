import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { QUEUE_NAMES } from '@agap/shared';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { WebAuthnService } from './webauthn.service';
import { WellKnownController } from './well-known.controller';
import { AuditModule } from '../audit/audit.module';
import { SessionsModule } from './sessions/sessions.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { PasswordChangeGuard } from './guards/password-change.guard';
import { RecentAuthGuard } from '../common/guards/recent-auth.guard';
import { LoginLockoutService } from './lockout/login-lockout.service';
import { MfaController } from './mfa/mfa.controller';
import { MfaService } from './mfa/mfa.service';
import { MfaStateStore } from './mfa/mfa-state.store';
import { MfaTokenService } from './mfa/mfa-token.service';
import { TotpService } from './mfa/totp.service';
import { BackupCodesService } from './mfa/backup-codes.service';
import { TrustedDeviceService } from './mfa/trusted-device.service';
import { IdentityVerificationModule } from '../identity-verification/identity-verification.module';
import { IdentityVerificationController } from '../identity-verification/identity-verification.controller';

@Module({
  imports: [
    PassportModule,
    AuditModule,
    SessionsModule,
    IdentityVerificationModule,
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
  controllers: [AuthController, MfaController, WellKnownController, IdentityVerificationController],
  providers: [
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
    AuthService,
    WebAuthnService,
    LoginLockoutService,
    MfaService,
    MfaStateStore,
    MfaTokenService,
    TotpService,
    BackupCodesService,
    TrustedDeviceService,
    JwtStrategy,
    LocalStrategy,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    PasswordChangeGuard,
    RecentAuthGuard,
  ],
  exports: [
    AuthService,
    WebAuthnService,
    TrustedDeviceService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RecentAuthGuard,
  ],
})
export class AuthModule {}
