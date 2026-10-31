import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  RESCUE_ACCESS,
  RESCUE_TAKEN_TO,
  WATER_LEVELS,
  type RescueAccess,
  type RescueTakenTo,
  type WaterLevel,
} from '@agap/shared';

/**
 * One rescue trip (MOD-32/52, decision D2). Every field is optional. Counts only, never
 * names: children are under 18, elderly 60 and over; vulnerable groups may overlap but
 * each is at most `rescuedCount` (checked in the service, with the destination rules).
 * `notes` stays in this record and the ops drawer: never in a WS payload or notice.
 */
export class SubmitRescueTripDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 500, description: 'People rescued this trip' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  rescuedCount?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  families?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 500, description: 'Under 18' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  children?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 500, description: '60 and over' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  elderly?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  pwd?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  pregnant?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5000, description: 'People still waiting here (estimate)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  stillWaiting?: number;

  @ApiPropertyOptional({ enum: WATER_LEVELS })
  @IsOptional()
  @IsIn(WATER_LEVELS)
  waterLevel?: WaterLevel;

  @ApiPropertyOptional({ enum: RESCUE_ACCESS })
  @IsOptional()
  @IsIn(RESCUE_ACCESS)
  access?: RescueAccess;

  @ApiPropertyOptional({ enum: RESCUE_TAKEN_TO })
  @IsOptional()
  @IsIn(RESCUE_TAKEN_TO)
  takenTo?: RescueTakenTo;

  /** Required with takenTo EVACUATION_CENTER: an active evacuation-center facility. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  takenToFacilityId?: string;

  /** Only with takenTo OTHER. A place, never a name. */
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  takenToOther?: string;

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

  /** Set by the phone at the tap; a resend with the same ID gets the first trip back. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
