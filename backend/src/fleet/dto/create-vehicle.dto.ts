import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty()
  @IsString()
  organizationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plateNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitCode?: string;

  @ApiProperty({ example: 'AMBULANCE' })
  @IsString()
  resourceType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  make?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 2020 })
  @IsOptional()
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  capacityPersons?: number;
}
