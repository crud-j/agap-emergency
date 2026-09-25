import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FlushEventDto } from './flush-event.dto';

export class FlushBatchDto {
  @ApiProperty({ type: [FlushEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FlushEventDto)
  events!: FlushEventDto[];
}
