import { ApiProperty } from '@nestjs/swagger';
import { IsRecordId } from '../../common/decorators/is-record-id.decorator';

export class ReassignDispatchDto {
  @ApiProperty()
  @IsRecordId()
  resourceId!: string;
}

export class AddCrewDto {
  @ApiProperty()
  @IsRecordId()
  userId!: string;
}
