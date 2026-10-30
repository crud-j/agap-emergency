import { create } from 'zustand';
import type { IncidentType, IntakeAnswers, ReporterStatus } from '@agap/shared';
import type { PhotoCaptureMeta } from '@/src/types/incident-capture';
import { generateUUID } from '@/src/lib/uuid';

interface LocationData {
  lat: number;
  lng: number;
  accuracy?: number;
  /** Human-readable address resolved by MOD-12 reverse geocoding (display + submission). */
  address?: string;
  /** Barangay resolved from reverse geocoding — useful for Bocaue flood-zone routing. */
  barangay?: string;
}

interface PatientData {
  isReporter: boolean;
  isUnknown: boolean;
  name?: string;
  age?: number;
  sex?: 'male' | 'female' | 'other' | 'unknown';
}

/** MOD-09 structured caller intake, validated by the backend against the shared catalog. */
export interface IntakeDraft {
  answers: IntakeAnswers;
  reporterStatus: ReporterStatus | null;
  landmark: string | null;
}

interface IncidentDraft {
  idempotencyKey: string | null;
  isGuestReport: boolean;
  triggerMethod: 'SOS_BUTTON' | 'SHAKE_GESTURE' | 'MANUAL_REPORT';
  type: IncidentType | null;
  description: string | null;
  location: LocationData | null;
  patient: PatientData | null;
  photoUris: string[];
  /** Trusted capture provenance for the primary photo/video (Tier 1 validation). */
  photoCaptureMeta: PhotoCaptureMeta | null;
  videoUri: string | null;
  affectedCount: string | null;
  hazards: string[];
  responseNeeds: string[];
  manualAddress: string | null;
  intake: IntakeDraft | null;
}

interface IncidentState {
  draft: IncidentDraft;
  activeIncidentId: string | null;

  startSOS: (triggerMethod?: 'SOS_BUTTON' | 'SHAKE_GESTURE') => void;
  beginGuestReport: () => void;
  setIncidentType: (type: IncidentType) => void;
  setPatientIsReporter: (isReporter: boolean) => void;
  setPatient: (patient: PatientData | null) => void;
  setLocation: (location: LocationData) => void;
  clearLocation: () => void;
  addPhoto: (uri: string) => void;
  setPhotos: (uris: string[]) => void;
  setPhotoCaptureMeta: (meta: PhotoCaptureMeta | null) => void;
  setVideoUri: (uri: string | null) => void;
  setDescription: (desc: string | null) => void;
  setAffectedCount: (count: string | null) => void;
  setHazards: (hazards: string[]) => void;
  setResponseNeeds: (needs: string[]) => void;
  setManualAddress: (address: string | null) => void;
  setIntake: (intake: IntakeDraft | null) => void;
  reset: () => void;
  setActiveIncidentId: (id: string | null) => void;
}

const DEFAULT_DRAFT: IncidentDraft = {
  idempotencyKey: null,
  isGuestReport: false,
  triggerMethod: 'MANUAL_REPORT',
  type: null,
  description: null,
  location: null,
  patient: null,
  photoUris: [],
  photoCaptureMeta: null,
  videoUri: null,
  affectedCount: null,
  hazards: [],
  responseNeeds: [],
  manualAddress: null,
  intake: null,
};

export const useIncidentStore = create<IncidentState>((set) => ({
  draft: { ...DEFAULT_DRAFT },
  activeIncidentId: null,

  startSOS: (triggerMethod = 'SOS_BUTTON') =>
    set(() => ({
      draft: {
        ...DEFAULT_DRAFT,
        idempotencyKey: generateUUID(),
        triggerMethod,
      },
    })),

  beginGuestReport: () =>
    set(() => ({
      draft: {
        ...DEFAULT_DRAFT,
        idempotencyKey: generateUUID(),
        isGuestReport: true,
      },
      activeIncidentId: null,
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

  clearLocation: () =>
    set((s) => ({ draft: { ...s.draft, location: null } })),

  addPhoto: (uri) =>
    set((s) => ({
      draft: {
        ...s.draft,
        photoUris: [...s.draft.photoUris, uri].slice(0, 5),
      },
    })),

  setPhotos: (uris) =>
    set((s) => ({ draft: { ...s.draft, photoUris: uris.slice(0, 5) } })),

  setPhotoCaptureMeta: (photoCaptureMeta) =>
    set((s) => ({ draft: { ...s.draft, photoCaptureMeta } })),

  setVideoUri: (videoUri) =>
    set((s) => ({ draft: { ...s.draft, videoUri } })),

  setDescription: (description) =>
    set((s) => ({ draft: { ...s.draft, description } })),

  setAffectedCount: (affectedCount) =>
    set((s) => ({ draft: { ...s.draft, affectedCount } })),

  setHazards: (hazards) =>
    set((s) => ({ draft: { ...s.draft, hazards } })),

  setResponseNeeds: (responseNeeds) =>
    set((s) => ({ draft: { ...s.draft, responseNeeds } })),

  setManualAddress: (manualAddress) =>
    set((s) => ({ draft: { ...s.draft, manualAddress } })),

  setIntake: (intake) =>
    set((s) => ({ draft: { ...s.draft, intake } })),

  reset: () => set({ draft: { ...DEFAULT_DRAFT }, activeIncidentId: null }),

  setActiveIncidentId: (activeIncidentId) => set({ activeIncidentId }),
}));
