import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

const LIST_MAX_ITEMS = 20;
const ITEM_MAX_LENGTH = 60;

// "Unknown" is a valid answer but is stored as null; blood_type is VarChar(5).
function normalizeBloodType({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toUpperCase();
  return normalized === '' || normalized === 'UNKNOWN' ? null : normalized;
}

function trimItems({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return value;
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '');
}

function trimToNull({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
}

export class CreateMedicalProfileDto {
  @ApiPropertyOptional({ example: 'O+', nullable: true, maxLength: 5 })
  @Transform(normalizeBloodType)
  @IsOptional()
  @IsString()
  @MaxLength(5, { message: 'bloodType must be at most 5 characters (e.g. AB+)' })
  bloodType?: string | null;

  @ApiPropertyOptional({ type: [String], example: ['Penicillin'], maxItems: LIST_MAX_ITEMS })
  @Transform(trimItems)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIST_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM_MAX_LENGTH, { each: true })
  allergies?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: LIST_MAX_ITEMS })
  @Transform(trimItems)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIST_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM_MAX_LENGTH, { each: true })
  currentMedications?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: LIST_MAX_ITEMS })
  @Transform(trimItems)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIST_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM_MAX_LENGTH, { each: true })
  medicalConditions?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: LIST_MAX_ITEMS })
  @Transform(trimItems)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIST_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM_MAX_LENGTH, { each: true })
  disabilities?: string[];

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  responderNotes?: string | null;
}
