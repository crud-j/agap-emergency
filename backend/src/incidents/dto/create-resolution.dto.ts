import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const PATIENT_DISPOSITIONS = [
  'TREATED_ON_SCENE',
  'TRANSPORTED_TO_HOSPITAL',
  'TRANSPORTED_TO_EVACUATION_CENTER',
  'REFUSED_TRANSPORT',
  'DECEASED_ON_SCENE',
  'TRANSFERRED_TO_OTHER_AGENCY',
  'UNABLE_TO_LOCATE',
  'NO_PATIENT_FOUND',
  'OTHER',
] as const;

/** MOD-45 — the outcome recorded before closing. */
export class CreateResolutionDto {
  @ApiProperty({ example: 'PATIENT_TRANSPORTED', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  outcome!: string;

  @ApiPropertyOptional({ enum: PATIENT_DISPOSITIONS })
  @IsOptional()
  @IsIn(PATIENT_DISPOSITIONS)
  patientDisposition?: (typeof PATIENT_DISPOSITIONS)[number];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNotes?: string;
}
