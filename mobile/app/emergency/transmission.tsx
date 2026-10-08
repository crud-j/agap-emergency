import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useIncidentStore } from '@/src/stores/incident.store';
import { useAuthStore } from '@/src/stores/auth.store';
import { submitIncident, uploadIncidentPhoto } from '@/src/services/api/incidents.api';
import { OfflineQueueService } from '@/src/services/offline/offline-queue.service';
import type { CreateIncidentInput } from '@agap/shared';
import { ReporterType } from '@agap/shared';

type TransmissionState = 'submitting' | 'success' | 'queued' | 'failed';

export default function TransmissionScreen() {
  const router = useRouter();
  const { draft, setActiveIncidentId } = useIncidentStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [state, setState] = useState<TransmissionState>('submitting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    transmit();
  }, []);

  async function transmit() {
    if (!draft.idempotencyKey || !draft.type) {
      setState('failed');
      setError('Incomplete emergency report');
      return;
    }

    const payload: CreateIncidentInput = {
      type: draft.type,
      idempotencyKey: draft.idempotencyKey,
      description: draft.description ?? undefined,
      lat: draft.location?.lat,
      lng: draft.location?.lng,
      // Prefer manual address (typed by reporter when GPS was unavailable), then
      // the address the reporter confirmed on the location screen (MOD-12). When
      // neither is present the backend reverse-geocodes from lat/lng on submission.
      address: draft.manualAddress ?? draft.location?.address ?? undefined,
      reporter: { type: ReporterType.REGISTERED_CITIZEN },
      patient: draft.patient ?? undefined,
      affectedCount: draft.affectedCount ?? undefined,
      hazards: draft.hazards.length ? draft.hazards : undefined,
      responseNeeds: draft.responseNeeds.length ? draft.responseNeeds : undefined,
    };

    try {
      const result = await submitIncident(payload, accessToken ?? undefined);
      setActiveIncidentId(result.id);
      setState('success');

      // MOD-10: attach captured photos AFTER the incident is persisted.
      // Best-effort only — a failed upload must never affect the incident.
      if (accessToken && draft.photoUris.length > 0) {
        draft.photoUris.forEach((uri) => {
          uploadIncidentPhoto(result.id, uri, accessToken).catch(() => undefined);
        });
      }

      setTimeout(() => router.replace(`/incidents/${result.id}` as any), 2000);
    } catch {
      // Network failure — queue for offline retry
      try {
        await OfflineQueueService.enqueue(payload);
        setState('queued');
        // No server incident id yet (offline) — land on the incidents list; the
        // queued report appears once it syncs.
        setTimeout(() => router.replace('/incidents' as any), 2000);
      } catch {
        setState('failed');
        setError('Could not queue emergency. Please call 911 immediately.');
      }
    }
  }

  return (
    <View style={styles.container}>
      {state === 'submitting' && (
        <>
          <ActivityIndicator size="large" color="#DC2626" />
          <Text style={styles.message}>Transmitting emergency report...</Text>
        </>
      )}
      {state === 'success' && (
        <>
          <Text style={styles.icon}>✓</Text>
          <Text style={styles.message}>Emergency reported successfully</Text>
          <Text style={styles.sub}>Help is on the way</Text>
        </>
      )}
      {state === 'queued' && (
        <>
          <Text style={styles.iconWarning}>⏳</Text>
          <Text style={styles.message}>No connection — queued for retry</Text>
          <Text style={styles.sub}>Your emergency will be sent when connection is restored</Text>
        </>
      )}
      {state === 'failed' && (
        <>
          <Text style={styles.iconError}>✕</Text>
          <Text style={styles.message}>Transmission failed</Text>
          {error && <Text style={styles.error}>{error}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', padding: 32 },
  message: { fontSize: 20, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginTop: 24 },
  sub: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 12 },
  error: { fontSize: 14, color: '#FCA5A5', textAlign: 'center', marginTop: 12 },
  icon: { fontSize: 64, color: '#4ADE80' },
  iconWarning: { fontSize: 64 },
  iconError: { fontSize: 64, color: '#DC2626' },
});
