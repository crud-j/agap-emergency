import { create } from 'zustand';
import type { IncidentType } from '@agap/shared';

interface LocationData {
  lat: number;
  lng: number;
  accuracy?: number;
}

interface PatientData {
  isReporter: boolean;
  isUnknown: boolean;
  name?: string;
  age?: number;
  sex?: string;
}

interface IncidentDraft {
  idempotencyKey: string | null;
  type: IncidentType | null;
  description: string | null;
  location: LocationData | null;
  patient: PatientData | null;
  photoUris: string[];
}

interface IncidentState {
  draft: IncidentDraft;
  activeIncidentId: string | null;

  startSOS: () => void;
  setIncidentType: (type: IncidentType) => void;
  setPatientIsReporter: (isReporter: boolean) => void;
  setPatient: (patient: PatientData) => void;
  setLocation: (location: LocationData) => void;
  addPhoto: (uri: string) => void;
  setDescription: (desc: string) => void;
  reset: () => void;
  setActiveIncidentId: (id: string | null) => void;
}

const DEFAULT_DRAFT: IncidentDraft = {
  idempotencyKey: null,
  type: null,
  description: null,
  location: null,
  patient: null,
  photoUris: [],
};

export const useIncidentStore = create<IncidentState>((set) => ({
  draft: { ...DEFAULT_DRAFT },
  activeIncidentId: null,

  startSOS: () =>
    set((s) => ({
      draft: {
        ...DEFAULT_DRAFT,
        idempotencyKey: generateUUID(),
      },
    })),

  setIncidentType: (type) =>
    set((s) => ({ draft: { ...s.draft, type } })),

  setPatientIsReporter: (isReporter) =>
    set((s) => ({
      draft: {
        ...s.draft,
        patient: { isReporter, isUnknown: false },
      },
    })),

  setPatient: (patient) =>
    set((s) => ({ draft: { ...s.draft, patient } })),

  setLocation: (location) =>
    set((s) => ({ draft: { ...s.draft, location } })),

  addPhoto: (uri) =>
    set((s) => ({
      draft: {
        ...s.draft,
        photoUris: [...s.draft.photoUris, uri].slice(0, 5),
      },
    })),

  setDescription: (description) =>
    set((s) => ({ draft: { ...s.draft, description } })),

  reset: () => set({ draft: { ...DEFAULT_DRAFT }, activeIncidentId: null }),

  setActiveIncidentId: (activeIncidentId) => set({ activeIncidentId }),
}));

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
