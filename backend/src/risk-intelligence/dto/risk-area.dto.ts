import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { incident_category } from '@prisma/client';

export const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Same limits as risk-area-rules.ts (kept literal here: decorators need constants at load). */
const MIN_RADIUS = 50;
const MAX_RADIUS = 2000;

/**
 * MOD-51 risk area. A new area is a pin with a radius (2026-11-15): the barangay is found
 * from the pin and the circle becomes the area's boundary. `barangay` is kept for areas
 * created before pins and for approved whole-barangay flood proposals; the service checks
 * it against `geo_regions`, so the list has one source.
 */
export class CreateRiskAreaDto {
  @ApiProperty({ example: 'Lolomboy riverside' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: incident_category })
  @IsEnum(incident_category)
  riskType!: incident_category;

  @ApiProperty({ enum: RISK_LEVELS })
  @IsIn(RISK_LEVELS)
  riskLevel!: RiskLevel;

  @ApiPropertyOptional({ example: 14.7963, description: 'Pin latitude (inside Bocaue). Required for a new area.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 120.9272, description: 'Pin longitude (inside Bocaue).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: 300, description: 'Radius around the pin, 50 to 2000 m.' })
  @IsOptional()
  @IsInt()
  @Min(MIN_RADIUS)
  @Max(MAX_RADIUS)
  radiusMeters?: number;

  @ApiPropertyOptional({ example: 'Lolomboy', description: 'Only for areas without a pin (a Bocaue barangay name).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barangay?: string;

  @ApiPropertyOptional({ example: 11.5, description: 'Bocaue River level (m) that triggers this area' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(30)
  floodThresholdMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateRiskAreaDto extends PartialType(CreateRiskAreaDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** GET /risk-intelligence/areas/suggest: what the add form fills in from a pin. */
export class AreaSuggestionQuery {
  @ApiProperty({ example: 14.7963 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 120.9272 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiProperty({ example: 300 })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_RADIUS)
  @Max(MAX_RADIUS)
  radius!: number;

  @ApiProperty({ enum: incident_category })
  @IsEnum(incident_category)
  riskType!: incident_category;
}
