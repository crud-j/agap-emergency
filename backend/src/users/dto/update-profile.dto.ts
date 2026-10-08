import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barangay?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullAddress?: string;

  @ApiPropertyOptional({ enum: ['small', 'medium', 'large'] })
  @IsOptional()
  @IsIn(['small', 'medium', 'large'])
  textSize?: 'small' | 'medium' | 'large';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  highContrast?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reducedMotion?: boolean;
}
