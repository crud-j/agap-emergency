import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateDispatchDto {
  @ApiProperty()
  @IsString()
  incidentId!: string;

  @ApiProperty()
  @IsString()
  resourceId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priorityOverride?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dispatchNotes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  initialCrewIds?: string[];
}
