import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SmsSubscribeDto {
  @ApiProperty({ example: '09171234567' })
  @IsString()
  phoneNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barangayPreference?: string;
}
