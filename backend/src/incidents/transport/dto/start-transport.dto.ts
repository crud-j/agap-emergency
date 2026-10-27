import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsISO8601 } from 'class-validator';
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
}
