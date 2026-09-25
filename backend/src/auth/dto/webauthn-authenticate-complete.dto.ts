import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsUUID } from 'class-validator';

export class WebAuthnAuthenticateCompleteDto {
  @ApiProperty({ description: 'UUID of the webauthn_challenges record returned by begin' })
  @IsUUID()
  @IsNotEmpty()
  challengeId!: string;

  @ApiProperty({ description: 'Raw AuthenticationResponseJSON from the browser WebAuthn API' })
  @IsObject()
  response!: Record<string, unknown>;
}
