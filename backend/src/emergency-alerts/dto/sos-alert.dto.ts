import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { IncidentType } from '@agap/shared';

export class SosAlertDto {
  @ApiPropertyOptional({ description: 'Idempotency key from device' })
  @IsOptional()
  @IsString()
  clientEventId?: string;

  @ApiPropertyOptional({ example: 14.5995 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 120.9842 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  accuracyMeters?: number;

  @ApiProperty({ enum: IncidentType, example: IncidentType.MEDICAL })
  @IsEnum(IncidentType)
  incidentType!: IncidentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consciousnessState?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  breathingStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reporterName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reporterPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  patientIsReporter?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  patientIsUnknown?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  numberOfPatients?: number;
}
