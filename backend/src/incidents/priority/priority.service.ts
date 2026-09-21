import { Injectable } from '@nestjs/common';
import { IncidentType, IncidentPriority } from '@agap/shared';

const TYPE_DEFAULT_PRIORITY: Record<IncidentType, IncidentPriority> = {
  [IncidentType.FIRE]: IncidentPriority.HIGH,
  [IncidentType.MEDICAL]: IncidentPriority.HIGH,
  [IncidentType.ROAD_ACCIDENT]: IncidentPriority.HIGH,
  [IncidentType.FLOOD]: IncidentPriority.HIGH,
  [IncidentType.RESCUE]: IncidentPriority.HIGH,
  [IncidentType.INDUSTRIAL]: IncidentPriority.HIGH,
  [IncidentType.DEBRIS]: IncidentPriority.MEDIUM,
  [IncidentType.OTHER]: IncidentPriority.MEDIUM,
};

@Injectable()
export class PriorityService {
  recommend(type: IncidentType): IncidentPriority {
    return TYPE_DEFAULT_PRIORITY[type] ?? IncidentPriority.MEDIUM;
  }
}
