import React, { useEffect, useState } from 'react';
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
  FIRE_ALARM_LEVELS,
  FIRE_ALARM_LEVEL_LABELS,
  FIRE_HAZARDS,
  FIRE_HAZARD_LABELS,
  FIRE_OCCUPANCY_TYPES,
  FIRE_OCCUPANCY_TYPE_LABELS,
  FIRE_STATUSES,
  FIRE_STATUS_LABELS,
} from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import { colors, cardShadow, radius } from '@/src/theme/tokens';
import { ResponderHeader } from '@/src/components/responder/responder-header';
import { Chips, SaveBanner, Section, Stepper, type SaveState } from '@/src/components/responder/field-form';
import { getAssignment } from '@/src/services/api/responders.api';
import { getFireReports, submitFireReport } from '@/src/services/api/fire-reports.api';
import { NetworkError } from '@/src/services/api/http';
import { newOutboxItem } from '@/src/services/offline/transport-outbox';
import { useTransportOutbox } from '@/src/hooks/useTransportOutbox';
import {
  EMPTY_FIRE_REPORT_FORM,
  buildFireReportBody,
  formFromLatest,
  stepCount,
  toggleHazard,
  type FireReportForm,
} from '@/src/lib/fire-report';

const STATUS_OPTIONS = FIRE_STATUSES.map((value) => ({ value, label: FIRE_STATUS_LABELS[value] }));
const ALARM_OPTIONS = FIRE_ALARM_LEVELS.map((value) => ({ value, label: FIRE_ALARM_LEVEL_LABELS[value] }));
const OCCUPANCY_OPTIONS = FIRE_OCCUPANCY_TYPES.map((value) => ({ value, label: FIRE_OCCUPANCY_TYPE_LABELS[value] }));
const HAZARD_OPTIONS = FIRE_HAZARDS.map((value) => ({ value, label: FIRE_HAZARD_LABELS[value] }));

/**
 * Fire report form (MOD-32/36, unit field flow plan Phase 3). Every field is optional;
 * each submit is a new report and the latest is the current picture, so the form
 * starts from the last one. Offline (or behind other actions waiting on this phone),
 * the report waits in the outbox with its client request ID and is sent once.
 * Counts only: never write names.
 */
export default function FireReportScreen() {
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
  const { data: reports, isFetched } = useQuery({
    queryKey: ['fire-reports', incidentId],
    queryFn: () => getFireReports(incidentId as string, token as string),
    enabled: !!incidentId && !!token,
    retry: false,
  });

  const [form, setForm] = useState<FireReportForm>(EMPTY_FIRE_REPORT_FORM);
  const [prefilled, setPrefilled] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);

  // Start from the latest report once it loads (or stay empty offline / for the first one).
  useEffect(() => {
    if (prefilled || !isFetched) return;
    setForm(formFromLatest(reports?.[0]));
    setPrefilled(true);
  }, [isFetched, reports, prefilled]);

  const outbox = useTransportOutbox(dispatchId);
  // Offline, or behind actions already waiting (they go first): keep it on the phone.
  const mustQueue = !outbox.isOnline || outbox.pending.length > 0;

  function set<K extends keyof FireReportForm>(key: K, value: FireReportForm[K]) {
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
    // The ID is fixed at the tap and kept through every retry (Rule 12).
    const body = buildFireReportBody(form);
    const item = newOutboxItem({ kind: 'fireReport', incidentId, dispatchId, body });
    setErrorText(null);
    if (mustQueue) {
      await keepOnPhone(item);
      return;
    }
    setSaveState('saving');
    try {
      await submitFireReport(incidentId, { ...body, clientRequestId: item.clientRequestId }, token);
      await qc.invalidateQueries({ queryKey: ['fire-reports', incidentId] });
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
    const dirty = JSON.stringify(form) !== JSON.stringify(formFromLatest(reports?.[0]));
    if (!dirty) {
      router.canGoBack() ? router.back() : router.replace('/responder/home' as never);
      return;
    }
    Alert.alert('Leave without sending?', 'This fire report has not been sent.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => router.back() },
    ]);
  }

  const busy = saveState === 'saving';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <SafeAreaView edges={['top']} style={styles.header}>
        <ResponderHeader onBack={goBack} title="Fire Report" subtitle={assignment?.incidents?.public_reference} />
      </SafeAreaView>

      <SaveBanner state={saveState} errorText={errorText} />

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={styles.hint}>
          Every field is optional. Each report is kept; the newest is what dispatch sees. Counts only, no names.
        </Text>

        <Section title="Fire status">
          <Chips options={STATUS_OPTIONS} selected={form.fireStatus ? [form.fireStatus] : []}
            onPress={(v) => set('fireStatus', form.fireStatus === v ? null : v)} disabled={busy} />
        </Section>

        <Section title="Alarm level">
          <Chips options={ALARM_OPTIONS} selected={form.alarmLevel ? [form.alarmLevel] : []}
            onPress={(v) => set('alarmLevel', form.alarmLevel === v ? null : v)} disabled={busy} />
        </Section>

        <Section title="Hazards (tap all that apply)">
          <Chips options={HAZARD_OPTIONS} selected={form.hazards} danger
            onPress={(v) => set('hazards', toggleHazard(form.hazards, v))} disabled={busy} />
        </Section>

        <Section title="People">
          <Stepper label="Trapped" value={form.trappedPersons} disabled={busy}
            onChange={(delta) => set('trappedPersons', stepCount(form.trappedPersons, delta))} />
          <Stepper label="Casualties seen" value={form.casualtiesSeen} disabled={busy}
            onChange={(delta) => set('casualtiesSeen', stepCount(form.casualtiesSeen, delta))} />
        </Section>

        <Section title="Structures">
          <Stepper label="Structures involved" value={form.structuresInvolved} disabled={busy}
            onChange={(delta) => set('structuresInvolved', stepCount(form.structuresInvolved, delta, 500))} />
          <Chips options={OCCUPANCY_OPTIONS} selected={form.occupancyType ? [form.occupancyType] : []}
            onPress={(v) => set('occupancyType', form.occupancyType === v ? null : v)} disabled={busy} />
        </Section>

        <Section title="Spreading to neighbours?">
          <YesNo value={form.spreading} onChange={(v) => set('spreading', v)} disabled={busy} />
        </Section>

        <Section title="Area evacuation needed?">
          <YesNo value={form.evacuationNeeded} onChange={(v) => set('evacuationNeeded', v)} disabled={busy} />
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
          accessibilityLabel="Send fire report"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="flame" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.submitText}>Send fire report</Text>
            </>
          )}
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

function YesNo({ value, onChange, disabled }: { value: boolean | null; onChange: (v: boolean | null) => void; disabled?: boolean }) {
  return (
    <Chips
      options={[{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }]}
      selected={value == null ? [] : [value ? 'YES' : 'NO']}
      onPress={(v) => {
        const next = v === 'YES';
        onChange(value === next ? null : next);
      }}
      disabled={disabled}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.bg },

  body: { flex: 1 },
  hint: { color: colors.textSub, fontSize: 13, lineHeight: 19, marginBottom: 16 },

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
    flexDirection: 'row', height: 56, borderRadius: radius.lg, backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: colors.track },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
