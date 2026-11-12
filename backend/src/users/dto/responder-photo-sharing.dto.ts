import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ResponderPhotoSharingDto {
  @ApiProperty({ description: 'Show my profile photo to the dispatchers and crew of my active reports' })
  @IsBoolean()
  enabled!: boolean;
}
