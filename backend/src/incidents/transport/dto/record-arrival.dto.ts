import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
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

  @ApiPropertyOptional({
    description: 'When the crew tapped Arrived, if it was sent later (offline). At most 30 min ago and not in the future',
  })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiPropertyOptional({
    description: 'Generated on the phone when the crew taps; a retry with the same id gets the first answer (plan §19)',
  })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
