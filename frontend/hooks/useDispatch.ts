import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── Types (loosely mirror the backend Prisma rows) ─────────────────────────

export interface IncidentLocation {
  latitude: string | number | null;
  longitude: string | number | null;
  formatted_address: string | null;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
}

export interface IncidentListItem {
  id: string;
  public_reference: string;
  category: string;
  priority: string;
  status: string;
  description: string | null;
  number_of_patients: number | null;
  submitted_at: string;
  acknowledged_at: string | null;
  dispatched_at: string | null;
  on_scene_at: string | null;
  incident_locations: IncidentLocation | null;
}

export interface IncidentDetail extends IncidentListItem {
  incident_reporters?: { reporter_name: string | null; reporter_phone: string | null; is_guest: boolean } | null;
  incident_patients?: Array<{ patient_name: string | null; approximate_age: number | null; sex: string | null; is_unknown: boolean }>;
  dispatches?: Array<{ id: string; status: string; resource_id: string }>;
}

export interface Unit {
  id: string;
  name: string;
  call_sign: string | null;
  resource_type: string;
  status: string;
  base_barangay: string | null;
  organization_id: string;
}

export interface Responder {
  id: string;
  full_name: string;
  phone_number: string | null;
  status: string | null;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/** All incidents for the ops queue (newest first). Polls as a WS fallback. */
export function useDispatchIncidents() {
  return useQuery({
    queryKey: ['dispatch-incidents'],
    queryFn: () =>
      api.get<{ data: IncidentListItem[] }>('/incidents?perPage=100', getToken()),
    refetchInterval: 20000,
    select: (res) => res.data ?? [],
  });
}

export function useIncidentDetail(id: string | null) {
  return useQuery({
    queryKey: ['dispatch-incident', id],
    queryFn: () => api.get<IncidentDetail>(`/incidents/${id}`, getToken()),
    enabled: !!id,
    refetchInterval: 15000,
  });
}

export function useAvailableUnits() {
  return useQuery({
    queryKey: ['available-units'],
    queryFn: () => api.get<Unit[]>('/resources/available', getToken()),
    refetchInterval: 20000,
  });
}

export function useResponders() {
  return useQuery({
    queryKey: ['responders'],
    queryFn: () => api.get<Responder[]>('/responders', getToken()),
    staleTime: 60000,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function useIncidentMutation(action: (id: string) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['dispatch-incidents'] });
      qc.invalidateQueries({ queryKey: ['dispatch-incident', id] });
    },
  });
}

export function useAcknowledge() {
  return useIncidentMutation((id) => api.patch(`/incidents/${id}/acknowledge`, {}, getToken()));
}

export function useAssess() {
  return useIncidentMutation((id) => api.patch(`/incidents/${id}/assess`, {}, getToken()));
}

export interface CreateDispatchInput {
  incidentId: string;
  resourceId: string;
  initialCrewIds?: string[];
  dispatchNotes?: string;
}

/**
 * Authorize a dispatch (MOD-31). Always an explicit dispatcher action — never
 * autonomous (Architectural Rule 8). Invalidates incidents + available units.
 */
export function useCreateDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDispatchInput) => api.post('/dispatch', input, getToken()),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['dispatch-incidents'] });
      qc.invalidateQueries({ queryKey: ['dispatch-incident', input.incidentId] });
      qc.invalidateQueries({ queryKey: ['available-units'] });
    },
  });
}
