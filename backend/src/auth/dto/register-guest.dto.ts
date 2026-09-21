import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RegisterGuestDto {
  @ApiPropertyOptional({ example: 'Bystander' })
  @IsOptional()
  @IsString()
  reporterName?: string;

  @ApiPropertyOptional({ example: '09171234567' })
  @IsOptional()
  @IsString()
  reporterPhone?: string;
}
