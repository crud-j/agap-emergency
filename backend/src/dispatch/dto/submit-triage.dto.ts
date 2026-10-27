import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { IncidentPriority } from '@agap/shared';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

/** MOD-24/25 — the dispatcher's priority decision (the recommendation only assists). */
export class SubmitTriageDto {
  /** Taken from the route; accepted in the body only for older clients. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsRecordId()
  incidentId?: string;

  @ApiProperty({ enum: IncidentPriority, example: IncidentPriority.HIGH })
  @IsEnum(IncidentPriority)
  priorityAssessment!: IncidentPriority;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredCapabilities?: string[];
}
