import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateConsentDto {
  @ApiProperty({ example: 'MEDICAL_PROFILE' })
  @IsString()
  consentType!: string;

  @ApiPropertyOptional({ example: '203.0.113.5' })
  @IsOptional()
  @IsString()
  ipAddress?: string;
}
