import { IsEnum } from 'class-validator';
import { ResponderAvailability } from '@agap/shared';

export class UpdateAvailabilityDto {
  @IsEnum(ResponderAvailability)
  status: ResponderAvailability;
}
