import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

export class CreateReferralDto {
  @ApiProperty()
  @IsRecordId()
  incidentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRecordId()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRecordId()
  dispatchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  preArrivalNotes?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  etaMinutes?: number;
}
