import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject } from 'class-validator';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

export class WebAuthnAuthenticateCompleteDto {
  @ApiProperty({ description: 'UUID of the webauthn_challenges record returned by begin' })
  @IsRecordId()
  @IsNotEmpty()
  challengeId!: string;

  @ApiProperty({ description: 'Raw AuthenticationResponseJSON from the browser WebAuthn API' })
  @IsObject()
  response!: Record<string, unknown>;
}
