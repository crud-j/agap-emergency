import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

const NOTE_MAX = 500;

/** MOD-08 — Triage "False Alert". */
export class FalseAlertDto {
  @ApiPropertyOptional({ maxLength: NOTE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX)
  notes?: string;
}

/** MOD-26 — the incident this one repeats. */
export class MergeIncidentDto {
  @ApiProperty()
  @IsRecordId()
  masterIncidentId!: string;
}

/** POST /incidents/:id/duplicate — the service asks for the master when it's missing. */
export class MarkDuplicateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsRecordId()
  masterIncidentId?: string;
}

export class IncidentFeedbackDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}

/** MOD-34 — add a participating agency. */
export class AddAgencyDto {
  @ApiProperty()
  @IsRecordId()
  organizationId!: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'Fire suppression' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  roleInIncident?: string;
}

export enum IcsPosition {
  INCIDENT_COMMANDER = 'INCIDENT_COMMANDER',
  OPERATIONS_SECTION_CHIEF = 'OPERATIONS_SECTION_CHIEF',
  LOGISTICS_SECTION_CHIEF = 'LOGISTICS_SECTION_CHIEF',
  PLANNING_SECTION_CHIEF = 'PLANNING_SECTION_CHIEF',
  SAFETY_OFFICER = 'SAFETY_OFFICER',
  PUBLIC_INFORMATION_OFFICER = 'PUBLIC_INFORMATION_OFFICER',
  LIAISON_OFFICER = 'LIAISON_OFFICER',
}

/** MOD-36 — ICS objectives: up to 20 short lines. */
export class ActivateIcsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  objectives?: string[];
}

export class UpdateIcsDto extends ActivateIcsDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(4000) // same limit as ICS_SITUATION_NOTES_MAX in the service
  situationNotes?: string | null;
}

export class AssignIncidentCommanderDto {
  @ApiProperty()
  @IsRecordId()
  userId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRecordId()
  organizationId?: string;
}

export class AssignIcsPositionDto extends AssignIncidentCommanderDto {
  @ApiProperty({ enum: IcsPosition })
  @IsEnum(IcsPosition)
  position!: IcsPosition;
}
