import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { MANUAL_RESOURCE_STATUSES, ResourceStatus } from '@agap/shared';

export class UpdateResourceStatusDto {
  // Only the statuses a person sets. Mission statuses (Dispatched, En route, On scene,
  // Transporting, Returning) come from dispatch and the crew's progress, so the board
  // can't claim a unit in the workshop is transporting. An unknown or mission value is
  // a 400 naming the allowed ones.
  @ApiProperty({ enum: MANUAL_RESOURCE_STATUSES, example: ResourceStatus.OUT_OF_SERVICE })
  @IsIn(MANUAL_RESOURCE_STATUSES as ResourceStatus[], {
    message: `status must be one of: ${MANUAL_RESOURCE_STATUSES.join(', ')}. Mission statuses are set by dispatch and the crew.`,
  })
  status!: ResourceStatus;
}
