import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { TriageTagDto } from './triage-tag.dto';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

export class DeactivateSurgeDto {
  @ApiProperty()
  @IsRecordId()
  surgeId!: string;
}

export class LinkSurgeIncidentDto {
  @ApiProperty()
  @IsRecordId()
  surgeId!: string;

  @ApiProperty()
  @IsRecordId()
  incidentId!: string;
}

export class SurgeBroadcastDto {
  @ApiProperty()
  @IsRecordId()
  surgeId!: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;
}

export class UpdateTriageTagDto extends PartialType(TriageTagDto) {}
