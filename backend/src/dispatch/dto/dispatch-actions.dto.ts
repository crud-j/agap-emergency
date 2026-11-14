import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateIf, IsNotEmpty } from 'class-validator';
import {
  DISPATCH_CHANGE_NOTES_MAX,
  DISPATCH_CHANGE_NOTE_REQUIRED,
  DISPATCH_CHANGE_REASON_CODES,
  type DispatchChangeReason,
} from '@agap/shared';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

/** Why a unit is recalled or replaced (MOD-31). "Other" needs a note. */
export class DispatchChangeDto {
  @ApiProperty({ enum: DISPATCH_CHANGE_REASON_CODES })
  @IsIn(DISPATCH_CHANGE_REASON_CODES)
  reason!: DispatchChangeReason;

  @ApiPropertyOptional({ maxLength: DISPATCH_CHANGE_NOTES_MAX })
  @ValidateIf((o: DispatchChangeDto) => DISPATCH_CHANGE_NOTE_REQUIRED.has(o.reason) || o.notes !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'Add a note when the reason is "Other".' })
  @MaxLength(DISPATCH_CHANGE_NOTES_MAX)
  notes?: string;
}

export class CancelDispatchDto extends DispatchChangeDto {}

export class ReassignDispatchDto extends DispatchChangeDto {
  @ApiProperty()
  @IsRecordId()
  resourceId!: string;

  /** The replacement unit's crew. Without crew nobody receives the assignment. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsRecordId({ each: true })
  crewIds?: string[];
}

export class AddCrewDto {
  @ApiProperty()
  @IsRecordId()
  userId!: string;
}
