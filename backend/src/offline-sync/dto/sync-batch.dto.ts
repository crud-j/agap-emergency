import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OfflineEventDto } from './offline-event.dto';

export class SyncBatchDto {
  @ApiProperty({ type: [OfflineEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OfflineEventDto)
  events!: OfflineEventDto[];
}
