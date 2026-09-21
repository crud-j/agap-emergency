import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateResourceStatusDto {
  @ApiProperty({ example: 'AVAILABLE' })
  @IsString()
  status!: string;
}
