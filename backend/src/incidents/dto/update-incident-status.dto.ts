import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentStatus } from '@agap/shared';

export class UpdateIncidentStatusDto {
  @ApiProperty({ enum: IncidentStatus, description: 'Target lifecycle status' })
  @IsEnum(IncidentStatus)
  status: IncidentStatus;

  @ApiPropertyOptional({ description: 'Optional reason recorded in the audit event' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
