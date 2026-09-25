import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsObject, IsString } from 'class-validator';

export class FlushEventDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsString()
  client_event_id!: string;

  @ApiProperty({ example: 'SOS', description: 'SOS | LOCATION_UPDATE | STATUS_UPDATE' })
  @IsString()
  type!: string;

  @ApiProperty({ type: Object })
  @IsDefined()
  @IsObject()
  payload!: Record<string, unknown>;
}
