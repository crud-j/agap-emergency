import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AddCapabilityDto {
  @ApiProperty()
  @IsString()
  capabilityId!: string;
}
