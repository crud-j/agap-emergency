import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateHospitalDto {
  @ApiProperty({ example: 'Bocaue District Hospital' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barangay?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  municipality?: string;

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
