import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Mirror the Prisma enums (no shared enum exists for these yet).
export const CONSCIOUSNESS_STATES = ['CONSCIOUS', 'UNCONSCIOUS', 'ALTERED', 'UNKNOWN'] as const;
export const BREATHING_STATES = ['NORMAL', 'DIFFICULTY', 'NOT_BREATHING', 'UNKNOWN'] as const;

export class VitalsDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(300) bloodPressureSys?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(200) bloodPressureDia?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(400) pulseBpm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(120) respiratoryRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(50) temperatureCelsius?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) oxygenSaturation?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(3) @Max(15) gcsScore?: number;
}

/**
 * On-scene patient assessment (MOD-37). Every field is optional — a responder
 * can submit whatever they have; missing data must never block submission.
 */
export class SubmitAssessmentDto {
  @ApiPropertyOptional({ enum: CONSCIOUSNESS_STATES })
  @IsOptional()
  @IsIn(CONSCIOUSNESS_STATES)
  consciousnessState?: string;

  @ApiPropertyOptional({ enum: BREATHING_STATES })
  @IsOptional()
  @IsIn(BREATHING_STATES)
  breathingStatus?: string;

  @ApiPropertyOptional({ type: VitalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VitalsDto)
  vitals?: VitalsDto;

  @ApiPropertyOptional({ description: 'Updated patient count observed on scene' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  numberOfPatients?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleInjuries?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interventions?: string[];

  @ApiPropertyOptional({ description: 'START/triage colour tag, e.g. RED/YELLOW/GREEN/BLACK' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  triageTag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dispatchId?: string;
}
