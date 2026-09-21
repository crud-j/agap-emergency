import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class TrackLocationDto {
  @ApiProperty()
  @IsString()
  incidentId!: string;

  @ApiProperty({ example: 14.5995 })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 120.9842 })
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  accuracyMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  speedKmh?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  headingDegrees?: number;
}
