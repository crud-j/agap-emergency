import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Send a CRITICAL draft to MDRRMO (ROLE_DASHBOARDS_PLAN.md Phase 7). */
export class SubmitAnnouncementDto {
  @ApiPropertyOptional({ description: 'Release time once approved (ISO 8601). Omit to release on approval.' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

/** The Supervisor sends a submission back to draft with a reason. */
export class ReturnAnnouncementDto {
  @ApiProperty({ description: 'What the officer must change before resubmitting' })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}
