import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

export class HospitalLocationInput {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsString()
  @IsIn(['manual', 'nominatim', 'manual+osm-crosscheck'])
  source!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceRef?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class CreateHospitalDto {
  @ApiProperty({ example: 'Bocaue District Hospital' })
  @IsString()
  @Length(2, 255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barangay?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  municipality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRecordId()
  organizationId?: string;

  @ApiPropertyOptional({ type: () => HospitalLocationInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => HospitalLocationInput)
  location?: HospitalLocationInput;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasEmergencyRoom?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasIcu?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bloodBank?: boolean;
}
