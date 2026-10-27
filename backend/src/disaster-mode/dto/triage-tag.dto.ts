import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { TRIAGE_COLORS } from '../../incidents/assessment/dto/submit-assessment.dto';

export class TriageTagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incidentId?: string;

  @ApiProperty({ enum: TRIAGE_COLORS, example: 'RED' })
  @IsIn(TRIAGE_COLORS)
  triageColor!: (typeof TRIAGE_COLORS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  triageNotes?: string;
}
