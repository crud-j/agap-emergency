import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordArrivalDto {
  @ApiPropertyOptional({ description: 'Override the destination facility if it changed en route' })
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @ApiPropertyOptional({ description: 'Notes about the facility arrival or patient condition on arrival' })
  @IsOptional()
  @IsString()
  notes?: string;
}
