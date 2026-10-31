import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RESCUE_ACCESS,
  RESCUE_ACCESS_LABELS,
  RESCUE_COUNT_LABELS,
  RESCUE_PART_COUNTS,
  RESCUE_TAKEN_TO,
  RESCUE_TAKEN_TO_LABELS,
  WATER_LEVELS,
  WATER_LEVEL_LABELS,
} from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import { colors, cardShadow, radius } from '@/src/theme/tokens';
import { ResponderHeader } from '@/src/components/responder/responder-header';
import { Chips, SaveBanner, Section, Stepper, type SaveState } from '@/src/components/responder/field-form';
import { getAssignment } from '@/src/services/api/responders.api';
import { getEvacuationCenters, getRescueSummary, submitRescueTrip } from '@/src/services/api/rescue-trips.api';
import { NetworkError } from '@/src/services/api/http';
import { newOutboxItem } from '@/src/services/offline/transport-outbox';
import { useTransportOutbox } from '@/src/hooks/useTransportOutbox';
import { stepCount } from '@/src/lib/field-counts';
import {
  EMPTY_RESCUE_TRIP_FORM,
  buildRescueTripBody,
  formFromLatestTrip,
  nearestCenters,
  needsCenter,
  partMax,
  withRescuedCount,
  type RescueTripForm,
} from '@/src/lib/rescue-trip';

const WATER_OPTIONS = WATER_LEVELS.map((value) => ({ value, label: WATER_LEVEL_LABELS[value] }));
const ACCESS_OPTIONS = RESCUE_ACCESS.map((value) => ({ value, label: RESCUE_ACCESS_LABELS[value] }));
const TAKEN_TO_OPTIONS = RESCUE_TAKEN_TO.map((value) => ({ value, label: RESCUE_TAKEN_TO_LABELS[value] }));

/**
 * Rescue trip form (MOD-32/52, unit field flow plan Phase 4). One submit = one trip;
 * every field is optional. The water level, access and last evacuation center carry
 * over from the previous trip. Offline (or behind other actions waiting on this phone),
 * the trip waits in the outbox with its client request ID and is sent once.
 * Counts only: never write names.
 */
export default function RescueTripScreen() {
  // `[id]` is the DISPATCH id, like the assignment screen (the outbox is per dispatch).
  const { id: dispatchId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);

  const { data: assignment } = useQuery({
    queryKey: ['responder-assignment', dispatchId],
    queryFn: () => getAssignment(dispatchId as string, token as string),
    enabled: !!dispatchId && !!token,
  });
  const incidentId = assignment?.incident_id;
  const { data: summary, isFetched } = useQuery({
    queryKey: ['rescue-summary', incidentId],
    queryFn: () => getRescueSummary(incidentId as string, token as string),
    enabled: !!incidentId && !!token,
    retry: false,
  });
  const { data: centers, isError: centersFailed } = useQuery({
    queryKey: ['evacuation-centers'],
    queryFn: () => getEvacuationCenters(token as string),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const location = assignment?.incidents?.incident_locations;
  const scene = location?.latitude != null && location?.longitude != null
    ? { lat: Number(location.latitude), lng: Number(location.longitude) }
    : null;
  const sortedCenters = useMemo(() => nearestCenters(centers ?? [], scene), [centers, scene?.lat, scene?.lng]);

  const [form, setForm] = useState<RescueTripForm>(EMPTY_RESCUE_TRIP_FORM);
  const [prefilled, setPrefilled] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);

  // Carry over the water level, access and center from the last trip once it loads.
  useEffect(() => {
    if (prefilled || !isFetched) return;
    setForm(formFromLatestTrip(summary?.trips[0]));
    setPrefilled(true);
  }, [isFetched, summary, prefilled]);

  const outbox = useTransportOutbox(dispatchId);
  // Offline, or behind actions already waiting (they go first): keep it on the phone.
  const mustQueue = !outbox.isOnline || outbox.pending.length > 0;

  function set<K extends keyof RescueTripForm>(key: K, value: RescueTripForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function done(state: SaveState) {
    setSaveState(state);
    setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/responder/home' as never)), 900);
  }

  async function keepOnPhone(item: ReturnType<typeof newOutboxItem>) {
    const result = await outbox.queue(item);
    if (result === 'FULL') {
      setSaveState('error');
      setErrorText('Three actions are already waiting on this phone. Reconnect so they can be sent first.');
      return;
    }
    void outbox.flush();
    done('queued');
  }

  async function handleSubmit() {
    if (!dispatchId || !incidentId || !token || saveState === 'saving') return;
    if (needsCenter(form)) {
      setSaveState('error');
      setErrorText('Choose the evacuation center, or another destination.');
      return;
    }
    // The ID is fixed at the tap and kept through every retry (Rule 12).
    const body = buildRescueTripBody(form);
    const item = newOutboxItem({ kind: 'rescueTrip', incidentId, dispatchId, body });
    setErrorText(null);
    if (mustQueue) {
      await keepOnPhone(item);
      return;
    }
    setSaveState('saving');
    try {
      await submitRescueTrip(incidentId, { ...body, clientRequestId: item.clientRequestId }, token);
      await qc.invalidateQueries({ queryKey: ['rescue-summary', incidentId] });
      done('synced');
    } catch (err) {
      if (err instanceof NetworkError) {
        // Same clientRequestId: if the first try did reach the server, the resend is recognised.
        await keepOnPhone(item);
        return;
      }
      setSaveState('error');
      setErrorText(err instanceof Error && err.message ? err.message : 'Not submitted. Try again.');
    }
  }

  function goBack() {
    if (saveState === 'saving') return;
    const dirty = JSON.stringify(form) !== JSON.stringify(formFromLatestTrip(summary?.trips[0]));
    if (!dirty) {
      router.canGoBack() ? router.back() : router.replace('/responder/home' as never);
      return;
    }
    Alert.alert('Leave without sending?', 'This rescue trip has not been sent.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => router.back() },
    ]);
  }

  const busy = saveState === 'saving';
  const max = partMax(form);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <SafeAreaView edges={['top']} style={styles.header}>
        <ResponderHeader onBack={goBack} title="Rescue Trip" subtitle={assignment?.incidents?.public_reference} />
      </SafeAreaView>

      <SaveBanner state={saveState} errorText={errorText} />

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={styles.hint}>
          One report per trip. Every field is optional. Counts only, no names.
          {summary && summary.tripCount > 0 ? ` So far: ${summary.rescued} rescued in ${summary.tripCount} trip${summary.tripCount === 1 ? '' : 's'}.` : ''}
        </Text>

        <Section title="This trip">
          <Stepper label={RESCUE_COUNT_LABELS.rescuedCount} value={form.rescuedCount} disabled={busy}
            onChange={(delta) => setForm((f) => withRescuedCount(f, stepCount(f.rescuedCount, delta, 500)))} />
          {RESCUE_PART_COUNTS.map((part) => (
            <Stepper key={part} label={RESCUE_COUNT_LABELS[part]} value={form[part]} disabled={busy}
              onChange={(delta) => set(part, stepCount(form[part], delta, max))} />
          ))}
        </Section>

        <Section title="People still waiting here (estimate)">
          <Stepper label={RESCUE_COUNT_LABELS.stillWaiting} value={form.stillWaiting} disabled={busy}
            onChange={(delta) => set('stillWaiting', stepCount(form.stillWaiting, delta, 5000))} />
        </Section>

        <Section title="Water level where you are">
          <Chips options={WATER_OPTIONS} selected={form.waterLevel ? [form.waterLevel] : []}
            onPress={(v) => set('waterLevel', form.waterLevel === v ? null : v)} disabled={busy} />
        </Section>

        <Section title="Access">
          <Chips options={ACCESS_OPTIONS} selected={form.access ? [form.access] : []}
            onPress={(v) => set('access', form.access === v ? null : v)} disabled={busy} />
        </Section>

        <Section title="Taken to">
          <Chips options={TAKEN_TO_OPTIONS} selected={form.takenTo ? [form.takenTo] : []}
            onPress={(v) => set('takenTo', form.takenTo === v ? null : v)} disabled={busy} />

          {form.takenTo === 'EVACUATION_CENTER' && (
            <View style={styles.centers}>
              {sortedCenters.length === 0 ? (
                <Text style={styles.centerHint}>
                  {centersFailed
                    ? 'The evacuation center list could not load (offline?). Choose another destination, or send this trip when back online.'
                    : 'Loading evacuation centers…'}
                </Text>
              ) : (
                sortedCenters.map((c) => {
                  const on = form.takenToFacilityId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.centerRow, on && styles.centerRowOn]}
                      onPress={() => set('takenToFacilityId', on ? null : c.id)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.centerName}>{c.name}</Text>
                        <Text style={styles.centerSub}>
                          {[c.barangay, c.distanceMeters != null ? `${(c.distanceMeters / 1000).toFixed(1)} km` : null]
                            .filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {form.takenTo === 'OTHER' && (
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              value={form.takenToOther}
              onChangeText={(v) => set('takenToOther', v)}
              placeholder="Where (a place, no names)"
              placeholderTextColor={colors.textSub}
              maxLength={200}
              editable={!busy}
            />
          )}
        </Section>

        <Section title="Notes (dispatch only)">
          <TextInput
            style={[styles.input, styles.notes]}
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            placeholder="What dispatch should know. No names."
            placeholderTextColor={colors.textSub}
            maxLength={1000}
            multiline
            textAlignVertical="top"
            editable={!busy}
          />
        </Section>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, (busy || !incidentId) && styles.submitBtnDisabled]}
          onPress={() => void handleSubmit()}
          disabled={busy || !incidentId}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Send rescue trip"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="boat" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.submitText}>Send rescue trip</Text>
            </>
          )}
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.bg },

  body: { flex: 1 },
  hint: { color: colors.textSub, fontSize: 13, lineHeight: 19, marginBottom: 16 },

  centers: { marginTop: 10, gap: 8 },
  centerHint: { color: colors.textSub, fontSize: 13, lineHeight: 19 },
  centerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, padding: 12,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  centerRowOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  centerName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  centerSub: { color: colors.textSub, fontSize: 12, marginTop: 2 },

  input: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: colors.text, ...cardShadow,
  },
  notes: { minHeight: 96 },

  footer: {
    paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  submitBtn: {
    flexDirection: 'row', height: 56, borderRadius: radius.lg, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: colors.track },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
