import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

/** MOD-33 — one incident chat message. */
export class SendMessageDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  messageText!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRecordId()
  attachmentId?: string;
}
