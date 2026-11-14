import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

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

  /**
   * Active units (PENDING/SENT/ACCEPTED) the sender saw on the incident when it
   * chose this unit. More than that under the incident lock means another
   * dispatcher or supervisor sent a unit meanwhile: 409 INCIDENT_DISPATCH_CHANGED
   * instead of a silent extra unit. Omitted → no check (older clients).
   */
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedActiveUnits?: number;
}
