import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ResourceStatus } from '@agap/shared';

export class UpdateResourceStatusDto {
  // An unknown value (for example MAINTENANCE) is a 400 naming the allowed ones,
  // not a Prisma error from the database enum.
  @ApiProperty({ enum: ResourceStatus, example: ResourceStatus.AVAILABLE })
  @IsEnum(ResourceStatus)
  status!: ResourceStatus;
}
