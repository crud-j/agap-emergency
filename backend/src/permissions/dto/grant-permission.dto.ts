import { ApiProperty } from '@nestjs/swagger';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

export class GrantPermissionDto {
  @ApiProperty()
  @IsRecordId()
  permissionId!: string;
}
