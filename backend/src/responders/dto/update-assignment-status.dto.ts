import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateAssignmentStatusDto {
  @ApiProperty({ example: 'EN_ROUTE' })
  @IsString()
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'TRANSPORTING only: generated on the phone when the crew taps; a retry with the same id gets the first answer (plan §19)',
  })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
