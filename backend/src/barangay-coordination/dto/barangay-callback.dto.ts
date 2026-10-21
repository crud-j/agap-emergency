import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const BARANGAY_OUTCOMES = ['ON_THE_WAY', 'HANDLED', 'NEEDS_BACKUP', 'NO_ANSWER'] as const;
export type BarangayOutcome = (typeof BARANGAY_OUTCOMES)[number];

/**
 * What the barangay can tap on the status page, in the order things normally happen:
 * seen → acting (ON_THE_WAY) → on scene → completed (HANDLED); backup can be asked at any point.
 */
export const BARANGAY_LINK_STATUSES = ['SEEN', 'ON_THE_WAY', 'ON_SCENE', 'HANDLED', 'NEEDS_BACKUP'] as const;
export type BarangayLinkStatus = (typeof BARANGAY_LINK_STATUSES)[number];

export class LinkReportDto {
  @IsIn(BARANGAY_LINK_STATUSES)
  status!: BarangayLinkStatus;
}

export class CallAttemptDto {
  @IsUUID()
  contactId!: string;
}

export class BarangayOutcomeDto {
  @IsIn(BARANGAY_OUTCOMES)
  outcome!: BarangayOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ConfirmHandledDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
