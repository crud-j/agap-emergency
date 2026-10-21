/** Matches the PostgreSQL incident_category enum exactly. */
export enum IncidentType {
  MEDICAL       = 'MEDICAL',
  ROAD_ACCIDENT = 'ROAD_ACCIDENT',
  FLOOD         = 'FLOOD',
  /** Typhoon damage, fallen trees, collapse, live wires — a natural disaster without flooding. */
  NATURAL_DISASTER = 'NATURAL_DISASTER',
  RESCUE        = 'RESCUE',
  FIRE          = 'FIRE',
  INDUSTRIAL    = 'INDUSTRIAL',
  DEBRIS        = 'DEBRIS',
  OTHER         = 'OTHER',
}
