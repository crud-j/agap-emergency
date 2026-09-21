import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class SubmitTriageDto {
  @ApiProperty()
  @IsString()
  incidentId!: string;

  @ApiProperty({ example: 'HIGH' })
  @IsString()
  priorityAssessment!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredCapabilities?: string[];
}
