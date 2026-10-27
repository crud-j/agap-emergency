import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { IsRecordId } from '../../../common/decorators/is-record-id.decorator';

export class RecordArrivalDto {
  @ApiPropertyOptional({ description: 'Override the destination facility if it changed en route' })
  @IsOptional()
  @IsRecordId()
  destinationId?: string;

  @ApiPropertyOptional({ description: 'Notes about the facility arrival or patient condition on arrival' })
  @IsOptional()
  @IsString()
  notes?: string;
}
