import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsISO8601, IsUUID } from 'class-validator';
import { IsRecordId } from '../../../common/decorators/is-record-id.decorator';

export class StartTransportDto {
  @ApiProperty({ description: 'Dispatch ID to associate this transport with' })
  @IsRecordId()
  dispatchId!: string;

  @ApiPropertyOptional({ description: 'Destination facility ID (optional — may be en-route decision)' })
  @IsOptional()
  @IsRecordId()
  destinationId?: string;

  @ApiPropertyOptional({ description: 'Patient record ID being transported' })
  @IsOptional()
  @IsRecordId()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Estimated arrival ISO timestamp' })
  @IsOptional()
  @IsISO8601()
  estimatedArrivalAt?: string;

  @ApiPropertyOptional({
    description: 'Generated on the phone when the crew taps; a retry with the same id gets the first answer (plan §19)',
  })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
