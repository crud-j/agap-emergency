import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class ActivateSurgeDto {
  @ApiProperty({ example: 'Typhoon Flood Response' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'FLOOD' })
  @IsString()
  category!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedBarangays?: string[];

  @ApiPropertyOptional({ example: 11.5 })
  @IsOptional()
  @IsNumber()
  bocaueRiverLevel?: number;
}
