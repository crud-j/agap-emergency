import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RISK_LEVELS, type RiskLevel } from './risk-area.dto';

export const PROPOSAL_STATUSES = ['PENDING', 'APPROVED', 'DISMISSED'] as const;

/** MOD-51: approving a proposed hotspot. Type and barangay come from the proposal. */
export class ApproveRiskAreaProposalDto {
  @ApiProperty({ example: 'Lolomboy flood hotspot' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: RISK_LEVELS })
  @IsIn(RISK_LEVELS)
  riskLevel!: RiskLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class ListRiskAreaProposalsQuery {
  @ApiPropertyOptional({ enum: PROPOSAL_STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsIn(PROPOSAL_STATUSES)
  status?: (typeof PROPOSAL_STATUSES)[number];
}
