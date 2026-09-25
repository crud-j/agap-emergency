import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WebAuthnRegisterBeginDto {
  @ApiPropertyOptional({ example: 'iPhone 15 Pro', description: 'Friendly name for the passkey device' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  deviceLabel?: string;
}
