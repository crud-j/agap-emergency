import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Held in memory by the browser between the password step and the second step. */
const MFA_TOKEN_MAX = 2048;

export class MfaTokenDto {
  @ApiProperty({ description: 'mfaToken returned by POST /auth/login' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MFA_TOKEN_MAX)
  mfaToken!: string;
}

export class MfaVerifyDto extends MfaTokenDto {
  @ApiProperty({ enum: ['totp', 'backup_code', 'sms'] })
  @IsIn(['totp', 'backup_code', 'sms'])
  method!: 'totp' | 'backup_code' | 'sms';

  @ApiProperty({ description: 'Authenticator code, backup code, or SMS code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @ApiPropertyOptional({ description: 'Skip the second step on this browser for 12 hours' })
  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}

export class MfaPasskeyCompleteDto extends MfaTokenDto {
  @ApiProperty()
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ description: 'Raw AuthenticationResponseJSON from the browser WebAuthn API' })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}

/** Enrollment endpoints take either a signed-in user's JWT or a forced-enrollment mfaToken. */
export class MfaEnrollDto {
  @ApiPropertyOptional({ description: 'Enrollment mfaToken; omit when signed in' })
  @IsOptional()
  @IsString()
  @MaxLength(MFA_TOKEN_MAX)
  mfaToken?: string;
}

export class MfaConfirmDto extends MfaEnrollDto {
  @ApiProperty({ description: 'First 6-digit code from the authenticator app' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code!: string;
}

/** Sensitive changes re-ask for the password (stand-in for Phase 5 step-up). */
export class MfaPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
