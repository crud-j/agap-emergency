import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsRecordId } from '../../../common/decorators/is-record-id.decorator';

export class UpdateTransportDto {
  @ApiPropertyOptional({ description: 'New destination facility' })
  @IsOptional()
  @IsRecordId()
  destinationId?: string;

  @ApiPropertyOptional({ description: 'Estimated arrival (ISO 8601). Always shown as an estimate.' })
  @IsOptional()
  @IsDateString()
  estimatedArrivalAt?: string;

  @ApiPropertyOptional({ description: 'Why the destination changed' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeReason?: string;
}
