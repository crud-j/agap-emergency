import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** MOD-52 surge rule edit (Supervisor). The barangays are checked against geo_regions in the service. */
export class UpdateSurgeRuleDto {
  @ApiPropertyOptional({ minimum: 5, maximum: 1440, example: 30 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  windowMinutes?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  minIncidents?: number;

  @ApiPropertyOptional({ type: [String], example: ['Lolomboy', 'Bunlo'], description: 'Empty = any barangay' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  barangays?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetRiverLevelDto {
  @ApiProperty({ example: 11.62, description: 'Bocaue River level in meters (critical at 11.50)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(30)
  meters!: number;
}
