import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class WebAuthnAuthenticateBeginDto {
  @ApiPropertyOptional({
    description: 'User UUID — if provided, restricts the ceremony to that user\'s registered passkeys. Omit for discoverable-credential (resident-key) flow.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
