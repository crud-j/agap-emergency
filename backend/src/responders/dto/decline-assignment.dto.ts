import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DeclineAssignmentDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}
