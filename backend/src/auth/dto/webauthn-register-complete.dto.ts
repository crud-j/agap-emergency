import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class WebAuthnRegisterCompleteDto {
  @ApiProperty({ description: 'UUID of the webauthn_challenges record returned by begin' })
  @IsUUID()
  @IsNotEmpty()
  challengeId!: string;

  @ApiProperty({ description: 'Raw RegistrationResponseJSON from the browser WebAuthn API' })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'iPhone 15 Pro', description: 'Friendly name for the passkey device' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  deviceLabel?: string;
}
