import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsObject, IsString } from 'class-validator';

export class OfflineEventDto {
  @ApiProperty()
  @IsString()
  clientEventId!: string;

  @ApiProperty({ example: 'INCIDENT_SUBMIT' })
  @IsString()
  eventType!: string;

  @ApiProperty({ type: Object })
  @IsDefined()
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiProperty({ example: '2026-09-19T10:00:00.000Z' })
  @IsString()
  queuedAtDevice!: string;
}
