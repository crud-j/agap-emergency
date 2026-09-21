import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateResourceDto {
  @ApiProperty()
  @IsString()
  organizationId!: string;

  @ApiProperty({ example: 'Ambulance 1' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'ALPHA-1' })
  @IsOptional()
  @IsString()
  callSign?: string;

  @ApiProperty({ example: 'AMBULANCE' })
  @IsString()
  resourceType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleId?: string;
}
