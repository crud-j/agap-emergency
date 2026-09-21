import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateMedicalProfileDto {
  @ApiPropertyOptional({ example: 'O+' })
  @IsOptional()
  @IsString()
  bloodType?: string;

  @ApiPropertyOptional({ type: [String], example: ['Penicillin'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  currentMedications?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicalConditions?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabilities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responderNotes?: string;
}
