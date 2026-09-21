import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class GeocodeDto {
  @ApiProperty({ example: 14.5995 })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 120.9842 })
  @IsNumber()
  longitude!: number;
}
