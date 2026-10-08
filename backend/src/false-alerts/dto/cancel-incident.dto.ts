import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CancellationReason {
  ACCIDENTAL_TRIGGER  = 'ACCIDENTAL_TRIGGER',
  SITUATION_RESOLVED  = 'SITUATION_RESOLVED',
  DUPLICATE_REPORT    = 'DUPLICATE_REPORT',
  WRONG_APP           = 'WRONG_APP',
  TEST                = 'TEST',
  OTHER               = 'OTHER',
}

export class CancelIncidentDto {
  @ApiProperty({ enum: CancellationReason, description: 'Reason for cancellation' })
  @IsEnum(CancellationReason)
  reason: CancellationReason;

  @ApiPropertyOptional({ description: 'Optional free-text notes', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class MarkFalseAlertDto {
  @ApiPropertyOptional({ description: 'Optional notes', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
