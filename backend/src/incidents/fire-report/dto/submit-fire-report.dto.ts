import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  FIRE_ALARM_LEVELS,
  FIRE_HAZARDS,
  FIRE_OCCUPANCY_TYPES,
  FIRE_STATUSES,
  type FireAlarmLevel,
  type FireHazard,
  type FireOccupancyType,
  type FireStatus,
} from '@agap/shared';

/**
 * A fire crew's size-up report (MOD-32/36, decision D1). Every field is optional: an
 * empty report is accepted, and missing data never blocks anything. Counts only, never
 * names. `notes` stays in this record and the ops drawer: never in a WS payload or notice.
 */
export class SubmitFireReportDto {
  @ApiPropertyOptional({ enum: FIRE_ALARM_LEVELS })
  @IsOptional()
  @IsIn(FIRE_ALARM_LEVELS)
  alarmLevel?: FireAlarmLevel;

  @ApiPropertyOptional({ enum: FIRE_STATUSES })
  @IsOptional()
  @IsIn(FIRE_STATUSES)
  fireStatus?: FireStatus;

  @ApiPropertyOptional({ minimum: 0, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  structuresInvolved?: number;

  @ApiPropertyOptional({ enum: FIRE_OCCUPANCY_TYPES })
  @IsOptional()
  @IsIn(FIRE_OCCUPANCY_TYPES)
  occupancyType?: FireOccupancyType;

  @ApiPropertyOptional({ enum: FIRE_HAZARDS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(FIRE_HAZARDS.length)
  @IsIn(FIRE_HAZARDS, { each: true })
  hazards?: FireHazard[];

  @ApiPropertyOptional({ description: 'Spreading to neighbouring structures' })
  @IsOptional()
  @IsBoolean()
  spreading?: boolean;

  @ApiPropertyOptional({ description: 'Evacuation of the area needed' })
  @IsOptional()
  @IsBoolean()
  evacuationNeeded?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  casualtiesSeen?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  trappedPersons?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /** Dispatcher/Supervisor filing from radio: which unit it is about. A crew's own dispatch is found on the server. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dispatchId?: string;

  /** Set by the phone at the tap; a resend with the same ID gets the first report back. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
