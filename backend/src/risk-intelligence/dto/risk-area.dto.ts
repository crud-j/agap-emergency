import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { incident_category } from '@prisma/client';

export const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * MOD-51 risk area (MODULE_GAPS_COMPLETION_PLAN.md Phase 5). The barangay is checked
 * against `geo_regions` in the service, so the list has one source. The boundary
 * polygon is not editable here; drawing it is out of scope.
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

  @ApiPropertyOptional({ example: 'Lolomboy', description: 'A Bocaue barangay name (geo_regions)' })
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
