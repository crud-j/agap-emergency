import type { IncidentStatus } from '../enums/incident-status.enum';
import type { IncidentPriority } from '../enums/incident-priority.enum';
import type { IncidentType } from '../enums/incident-type.enum';
import type { ReporterType } from '../enums/reporter-type.enum';
import type { GeoPoint } from './location.types';
export interface IncidentSummary {
    id: string;
    ticketNumber: string;
    type: IncidentType;
    priority: IncidentPriority;
    status: IncidentStatus;
    location: GeoPoint | null;
    address: string | null;
    reportedAt: string;
    updatedAt: string;
}
export interface ReporterInfo {
    type: ReporterType;
    userId: string | null;
    name: string | null;
    phone: string | null;
}
export interface PatientInfo {
    id: string;
    isReporter: boolean;
    name: string | null;
    age: number | null;
    sex: string | null;
    isUnknown: boolean;
}
//# sourceMappingURL=incident.types.d.ts.map