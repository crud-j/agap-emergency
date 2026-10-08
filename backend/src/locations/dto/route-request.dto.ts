import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class RouteRequestDto {
  @ApiProperty({ example: 14.7969 })
  @IsNumber()
  fromLat!: number;

  @ApiProperty({ example: 120.9268 })
  @IsNumber()
  fromLng!: number;

  @ApiProperty({ example: 14.8042 })
  @IsNumber()
  toLat!: number;

  @ApiProperty({ example: 120.9312 })
  @IsNumber()
  toLng!: number;
}
