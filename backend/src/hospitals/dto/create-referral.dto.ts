import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateReferralDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dispatchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preArrivalNotes?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  etaMinutes?: number;
}
