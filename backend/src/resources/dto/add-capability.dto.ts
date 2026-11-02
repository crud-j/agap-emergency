import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddCapabilityDto {
  @ApiProperty({ description: 'A capability id from GET /resources/capabilities' })
  @IsUUID()
  capabilityId!: string;
}
