import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TriageTagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incidentId?: string;

  @ApiProperty({ example: 'RED' })
  @IsString()
  triageColor!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  triageNotes?: string;
}
