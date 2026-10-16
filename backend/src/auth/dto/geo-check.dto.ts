import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, Max } from 'class-validator';

export class GeoCheckDto {
  @ApiProperty({ example: 14.7977, description: 'WGS-84 latitude' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 120.9374, description: 'WGS-84 longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

export interface GeoCheckResult {
  inside: boolean;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
}
