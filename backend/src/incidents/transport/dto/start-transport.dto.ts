import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsISO8601 } from 'class-validator';

export class StartTransportDto {
  @ApiProperty({ description: 'Dispatch ID to associate this transport with' })
  @IsUUID()
  dispatchId!: string;

  @ApiPropertyOptional({ description: 'Destination facility ID (optional — may be en-route decision)' })
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @ApiPropertyOptional({ description: 'Patient record ID being transported' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Estimated arrival ISO timestamp' })
  @IsOptional()
  @IsISO8601()
  estimatedArrivalAt?: string;
}
