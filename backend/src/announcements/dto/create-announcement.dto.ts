import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  announcement_category,
  announcement_language,
  announcement_scope,
  announcement_severity,
} from '@prisma/client';

/**
 * MOD-53 announcement draft. Mirrors the structured data model in
 * docs/automation/bocaue_mayor_announcement_format.md §3 — the composer fills
 * these from a template, but every field is stored separately (not one text box).
 */
export class CreateAnnouncementDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiProperty({ enum: announcement_category, example: 'FLOOD_ALERT' })
  @IsEnum(announcement_category)
  category!: announcement_category;

  @ApiProperty({ enum: announcement_severity, example: 'WARNING' })
  @IsEnum(announcement_severity)
  severity!: announcement_severity;

  @ApiProperty({ enum: announcement_scope, example: 'MUNICIPALITY_WIDE' })
  @IsEnum(announcement_scope)
  scope!: announcement_scope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetBarangays?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;

  // ─── Structured format fields ───────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'RIVER_LEVEL', description: 'Composer template used to generate the text' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  templateKey?: string;

  @ApiPropertyOptional({ description: 'Raw template field values, kept so a draft can be re-opened and audited' })
  @IsOptional()
  @IsObject()
  templateData?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: announcement_language, default: 'FIL' })
  @IsOptional()
  @IsEnum(announcement_language)
  language?: announcement_language;

  @ApiPropertyOptional({ maxLength: 400 })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actionRequired?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveStartAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveEndAt?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuingOffice?: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Official memo / order / verified source' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceReference?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  contactInfo?: string;

  @ApiPropertyOptional({ maxLength: 300, description: 'Screen-reader description of the attached image' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageAltText?: string;
}

export class CancelAnnouncementDto {
  @ApiProperty({ description: 'What changed and why — shown to residents' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  correctionNote!: string;
}
