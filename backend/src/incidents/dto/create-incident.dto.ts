import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsInt,
  IsIn,
  IsObject,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IncidentType,
  IncidentPriority,
  ReporterType,
  ReporterStatus,
  LANDMARK_MAX_LENGTH,
} from '@agap/shared';

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

/**
 * MOD-09 structured caller intake. `answers` is checked here only for shape;
 * IncidentsService re-validates it against the @agap/shared intake catalog and
 * drops any question or option the catalog does not define.
 */
export class IncidentIntakeDto {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    description: 'Intake question key → selected option values',
  })
  @IsOptional()
  @IsObject()
  answers?: Record<string, string[]>;

  @ApiPropertyOptional({ enum: ReporterStatus })
  @IsOptional()
  @IsEnum(ReporterStatus)
  reporterStatus?: ReporterStatus;

  @ApiPropertyOptional({ maxLength: LANDMARK_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(LANDMARK_MAX_LENGTH)
  landmark?: string;
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

  @ApiPropertyOptional({
    enum: ['1', '2-5', '5+', 'unknown'],
    description: 'Caller-estimated affected-person range; never a confirmed patient count',
  })
  @IsOptional()
  @IsString()
  @IsIn(['1', '2-5', '5+', 'unknown'])
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

  @ApiPropertyOptional({ type: IncidentIntakeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IncidentIntakeDto)
  intake?: IncidentIntakeDto;
}
