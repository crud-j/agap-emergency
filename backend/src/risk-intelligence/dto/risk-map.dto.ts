import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

/** The Risk Map's time windows (days). 90 matches hotspot discovery. */
export const RISK_MAP_PERIODS = [30, 90, 365] as const;
export type RiskMapPeriod = (typeof RISK_MAP_PERIODS)[number];
export const DEFAULT_RISK_MAP_PERIOD: RiskMapPeriod = 90;

export class RiskMapQuery {
  @ApiPropertyOptional({ enum: RISK_MAP_PERIODS, default: DEFAULT_RISK_MAP_PERIOD })
  @IsOptional()
  @Type(() => Number)
  @IsIn(RISK_MAP_PERIODS)
  periodDays?: RiskMapPeriod;
}
