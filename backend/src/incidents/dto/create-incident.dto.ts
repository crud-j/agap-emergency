import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsInt,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentType, IncidentPriority, ReporterType } from '@agap/shared';

export class ReporterDto {
  @ApiProperty({ enum: ReporterType })
  @IsEnum(ReporterType)
  type: ReporterType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class PatientDto {
  @ApiProperty()
  @IsBoolean()
  isReporter: boolean;

  @ApiProperty()
  @IsBoolean()
  isUnknown: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;

  @ApiPropertyOptional({ enum: ['male', 'female', 'other', 'unknown'] })
  @IsOptional()
  @IsString()
  sex?: string;
}

export class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType })
  @IsEnum(IncidentType)
  type: IncidentType;

  @ApiPropertyOptional({ enum: IncidentPriority })
  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiProperty({ description: 'UUID idempotency key for duplicate prevention' })
  @IsUUID()
  idempotencyKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  reporter?: ReporterDto;

  @ApiPropertyOptional()
  @IsOptional()
  patient?: PatientDto;

  @ApiPropertyOptional({ description: 'Affected count bucket from citizen: "1", "2-5", "5+", "unknown"' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  affectedCount?: string;

  @ApiPropertyOptional({ type: [String], description: 'Human-readable hazard strings from quick prompts' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hazards?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Requested response types: ambulance, fire_truck, rescue_boat, police' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responseNeeds?: string[];
}
