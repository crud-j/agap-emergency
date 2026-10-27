import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** MOD-35 — approve or deny a mutual-aid request. */
export class RequestDecisionDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RespondRequestDto extends RequestDecisionDto {
  @ApiProperty()
  @IsBoolean()
  accept!: boolean;
}
