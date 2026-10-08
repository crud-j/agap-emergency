import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WebAuthnAuthenticateBeginDto {
  @ApiPropertyOptional({
    description:
      "Email or phone number the user typed. The ceremony is scoped to that account's passkeys. Omit for a discoverable-credential (resident-key) flow.",
    example: '+639171234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  identifier?: string;
}
