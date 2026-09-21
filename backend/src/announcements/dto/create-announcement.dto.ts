import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAnnouncementDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  body!: string;

  @ApiProperty({ example: 'FLOOD_ALERT' })
  @IsString()
  category!: string;

  @ApiProperty({ example: 'WARNING' })
  @IsString()
  severity!: string;

  @ApiProperty({ example: 'MUNICIPALITY_WIDE' })
  @IsString()
  scope!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetBarangays?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
}
