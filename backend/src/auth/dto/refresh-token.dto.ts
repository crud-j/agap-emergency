import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  /** Required for mobile. Web clients omit it and send the HttpOnly `agap_refresh` cookie instead. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
