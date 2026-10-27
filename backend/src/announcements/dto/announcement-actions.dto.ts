import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString, MaxLength } from 'class-validator';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

export class UnsubscribeDto {
  @ApiProperty({ example: '09171234567' })
  @IsString()
  @MaxLength(20)
  phoneNumber!: string;
}

export class ScheduleAnnouncementDto {
  @ApiProperty({ description: 'ISO 8601 date and time' })
  @IsISO8601()
  scheduledAt!: string;
}

export class SupersedeAnnouncementDto {
  @ApiProperty()
  @IsRecordId()
  newAnnouncementId!: string;
}
