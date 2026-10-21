import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const CONTACT_ROLES = ['PRIMARY', 'BACKUP', 'OTHER'] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export class CreateBarangayContactDto {
  @IsString()
  @MaxLength(60)
  barangayId!: string;

  /** As typed: `0917 123 4567`, `+63 917…` or a landline `044-…`. Normalized server-side. */
  @IsString()
  @MaxLength(40)
  phone!: string;

  @IsIn(CONTACT_ROLES)
  role!: ContactRole;

  /** Whose phone it is, e.g. "BDRRMC chair". */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class UpdateBarangayContactDto {
  @IsOptional()
  @IsIn(CONTACT_ROLES)
  role?: ContactRole;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** true = MDRRMO confirmed this number now; false = clear the confirmation. */
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  isDemo?: boolean;
}
