import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** The app sends `fcmToken`; `token` is accepted for older builds. */
export class RegisterTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  fcmToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  token?: string;
}
