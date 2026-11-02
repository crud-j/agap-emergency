import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { organization_type } from '@prisma/client';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Bocaue MDRRMO' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'MDRRMO' })
  @IsOptional()
  @IsString()
  shortName?: string;

  // An unknown type (the web form once offered BARANGAY) is a 400 naming the allowed
  // ones, not a Prisma error from the database enum.
  @ApiProperty({ enum: organization_type, example: organization_type.MDRRMO })
  @IsEnum(organization_type)
  organizationType!: organization_type;

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
