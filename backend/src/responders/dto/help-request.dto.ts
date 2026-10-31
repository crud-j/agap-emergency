import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { CREW_HELP_NEEDS, type CrewHelpNeed } from '@agap/shared';

export class HelpRequestDto {
  @ApiProperty({ enum: CREW_HELP_NEEDS })
  @IsIn(CREW_HELP_NEEDS)
  need!: CrewHelpNeed;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
