import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class ResourceRequestDto {
  @ApiProperty()
  @IsString()
  incidentId!: string;

  @ApiProperty({ example: 'AMBULANCE' })
  @IsString()
  resourceType!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  quantity?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilityNeeded?: string[];

  @ApiPropertyOptional({ example: 'HIGH' })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestNotes?: string;
}
