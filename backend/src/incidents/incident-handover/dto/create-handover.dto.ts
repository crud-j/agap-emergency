import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';
import { IsRecordId } from '../../../common/decorators/is-record-id.decorator';

/** MOD-44 — hand an incident to the incoming dispatcher or supervisor. */
export class CreateHandoverDto {
  @ApiProperty({ description: 'An active Dispatcher or Supervisor (not yourself)' })
  @IsRecordId()
  toUserId!: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  situationSummary!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  pendingActions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  resourcesInField?: Record<string, unknown>;
}
