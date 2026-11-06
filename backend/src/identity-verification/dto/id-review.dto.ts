import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  ID_CARD_RELEASE_REASONS,
  ID_REJECTION_REASONS,
  ID_REVIEW_STATUSES,
  type IdCardReleaseReason,
  type IdRejectionReason,
  type IdReviewStatus,
} from '@agap/shared';

/** GET /administration/id-verifications */
export class IdReviewQueryDto {
  @ApiPropertyOptional({ enum: ID_REVIEW_STATUSES, default: 'PENDING_REVIEW' })
  @IsOptional()
  @IsIn(ID_REVIEW_STATUSES)
  status?: IdReviewStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;
}

/** POST /administration/id-verifications/find-by-pin. In the body, so the number stays out of URLs and logs. */
export class IdCardLookupDto {
  @ApiProperty({ description: 'The number printed on the card the citizen is showing', example: '00-000000001-0' })
  @IsString()
  @MaxLength(32)
  pin!: string;
}

/** POST /administration/id-verifications/:id/release — a fixed code, never free text. */
export class IdCardReleaseDto {
  @ApiProperty({ enum: ID_CARD_RELEASE_REASONS })
  @IsIn(ID_CARD_RELEASE_REASONS)
  reason!: IdCardReleaseReason;
}

/** POST /administration/id-verifications/:id/reject — a fixed code, never free text (plan §5.1). */
export class IdRejectDto {
  @ApiProperty({ enum: ID_REJECTION_REASONS })
  @IsIn(ID_REJECTION_REASONS)
  reason!: IdRejectionReason;
}
