import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Bocaue MDRRMO' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'MDRRMO' })
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiProperty({ example: 'MDRRMO' })
  @IsString()
  organizationType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barangay?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}
