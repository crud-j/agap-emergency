import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth.store';
import { colors, cardShadow, radius } from '@/src/theme/tokens';
import {
  submitAssessment,
  type SubmitAssessmentInput,
} from '@/src/services/api/assessments.api';
import { AssessmentQueueService } from '@/src/services/offline/assessment-queue.service';

type SaveState = 'idle' | 'saving' | 'synced' | 'queued' | 'error';

const CONSCIOUSNESS = [
  { value: 'CONSCIOUS', label: 'Conscious' },
  { value: 'ALTERED', label: 'Altered' },
  { value: 'UNCONSCIOUS', label: 'Unconscious' },
  { value: 'UNKNOWN', label: 'Unknown' },
];
const BREATHING = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'DIFFICULTY', label: 'Difficulty' },
  { value: 'NOT_BREATHING', label: 'Not breathing' },
  { value: 'UNKNOWN', label: 'Unknown' },
];
const TRIAGE = [
  { value: 'RED', color: '#DC2626' },
  { value: 'YELLOW', color: '#CA8A04' },
  { value: 'GREEN', color: '#16A34A' },
  { value: 'BLACK', color: '#1C2B3A' },
];

function parseNum(s: string): number | undefined {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * On-scene patient assessment form (MOD-37 / WS-5.1). Every field is optional —
 * a responder records whatever they have and submits; missing data never blocks.
 * Offline-safe: on a failed POST the assessment is queued locally and synced
 * later, with a visible save/sync indicator throughout.
 */
export default function AssessmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);

  const [consciousness, setConsciousness] = useState<string | null>(null);
  const [breathing, setBreathing] = useState<string | null>(null);
  const [triage, setTriage] = useState<string | null>(null);
  const [patients, setPatients] = useState('');
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [pulse, setPulse] = useState('');
  const [resp, setResp] = useState('');
  const [spo2, setSpo2] = useState('');
  const [temp, setTemp] = useState('');
  const [gcs, setGcs] = useState('');
  const [notes, setNotes] = useState('');

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [pending, setPending] = useState(0);

  const incidentId = id as string;

  const trySubmit = useCallback(
    (iid: string, payload: SubmitAssessmentInput) => submitAssessment(iid, payload, token as string),
    [token],
  );

  // Flush any locally-queued assessments whenever the screen opens.
  useEffect(() => {
    if (!incidentId || !token) return;
    let active = true;
    (async () => {
      const left = await AssessmentQueueService.flush(trySubmit);
      if (active) setPending(left || (await AssessmentQueueService.pendingCount(incidentId)));
    })();
    return () => {
      active = false;
    };
  }, [incidentId, token, trySubmit]);

  function buildPayload(): SubmitAssessmentInput {
    const vitals = {
      bloodPressureSys: parseNum(sys),
      bloodPressureDia: parseNum(dia),
      pulseBpm: parseNum(pulse),
      respiratoryRate: parseNum(resp),
      oxygenSaturation: parseNum(spo2),
      temperatureCelsius: parseNum(temp),
      gcsScore: parseNum(gcs),
    };
    const hasVitals = Object.values(vitals).some((v) => v !== undefined);
    const payload: SubmitAssessmentInput = {};
    if (consciousness) payload.consciousnessState = consciousness;
    if (breathing) payload.breathingStatus = breathing;
    if (triage) payload.triageTag = triage;
    const np = parseNum(patients);
    if (np !== undefined) payload.numberOfPatients = np;
    if (notes.trim()) payload.notes = notes.trim();
    if (hasVitals) payload.vitals = vitals;
    return payload;
  }

  async function handleSubmit() {
    if (!incidentId || !token || saveState === 'saving') return;
    const payload = buildPayload();
    setSaveState('saving');
    try {
      await submitAssessment(incidentId, payload, token);
      setSaveState('synced');
      setPending(await AssessmentQueueService.pendingCount(incidentId));
      setTimeout(() => router.back(), 900);
    } catch {
      // Offline / server unreachable — persist locally and sync later.
      await AssessmentQueueService.enqueue(incidentId, payload);
      setSaveState('queued');
      setPending(await AssessmentQueueService.pendingCount(incidentId));
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>On-Scene Assessment</Text>
        <View style={styles.iconBtn} />
      </SafeAreaView>

      <SyncBanner state={saveState} pending={pending} />

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={styles.hint}>
          Record whatever you can observe. Every field is optional — submit even partial findings.
        </Text>

        <Section title="Consciousness">
          <Segmented options={CONSCIOUSNESS} value={consciousness} onChange={setConsciousness} />
        </Section>

        <Section title="Breathing">
          <Segmented options={BREATHING} value={breathing} onChange={setBreathing} />
        </Section>

        <Section title="Triage tag">
          <View style={styles.triageRow}>
            {TRIAGE.map((t) => {
              const selected = triage === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  onPress={() => setTriage(selected ? null : t.value)}
                  style={[
                    styles.triagePill,
                    { borderColor: t.color },
                    selected && { backgroundColor: t.color },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.triageText, { color: selected ? '#FFFFFF' : t.color }]}>{t.value}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        <Section title="Patients on scene">
          <TextInput
            style={styles.input}
            value={patients}
            onChangeText={setPatients}
            keyboardType="number-pad"
            placeholder="e.g. 1"
            placeholderTextColor={colors.textSub}
          />
        </Section>

        <Section title="Vitals">
          <View style={styles.vitalsGrid}>
            <VitalInput label="BP sys" value={sys} onChange={setSys} />
            <VitalInput label="BP dia" value={dia} onChange={setDia} />
            <VitalInput label="Pulse" value={pulse} onChange={setPulse} />
            <VitalInput label="Resp" value={resp} onChange={setResp} />
            <VitalInput label="SpO₂ %" value={spo2} onChange={setSpo2} />
            <VitalInput label="Temp °C" value={temp} onChange={setTemp} decimal />
            <VitalInput label="GCS" value={gcs} onChange={setGcs} />
          </View>
        </Section>

        <Section title="Notes">
          <TextInput
            style={[styles.input, styles.notes]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Observations, interventions, context…"
            placeholderTextColor={colors.textSub}
            multiline
            textAlignVertical="top"
          />
        </Section>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, saveState === 'saving' && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saveState === 'saving'}
          activeOpacity={0.85}
        >
          {saveState === 'saving' ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="save" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.submitText}>Submit assessment</Text>
            </>
          )}
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

// ─── Sync / save state banner ────────────────────────────────────────────────

function SyncBanner({ state, pending }: { state: SaveState; pending: number }) {
  if (state === 'idle' && pending === 0) return null;

  const cfg =
    state === 'saving'
      ? { bg: colors.infoSoft, fg: colors.info, icon: 'cloud-upload-outline' as const, text: 'Saving…' }
      : state === 'synced'
        ? { bg: colors.primarySoft, fg: colors.primary, icon: 'checkmark-circle' as const, text: 'Submitted — dispatcher notified' }
        : state === 'queued'
          ? { bg: colors.amberSoft, fg: colors.amber, icon: 'cloud-offline-outline' as const, text: 'Saved offline — will sync automatically' }
          : state === 'error'
            ? { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' as const, text: 'Could not save' }
            : { bg: colors.amberSoft, fg: colors.amber, icon: 'time-outline' as const, text: `${pending} pending sync` };

  return (
    <View style={[styles.banner, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon} size={16} color={cfg.fg} style={{ marginRight: 8 }} />
      <Text style={[styles.bannerText, { color: cfg.fg }]}>{cfg.text}</Text>
      {pending > 0 && state !== 'queued' && (
        <Text style={[styles.bannerText, { color: cfg.fg, marginLeft: 'auto' }]}>· {pending} queued</Text>
      )}
    </View>
  );
}

// ─── Small building blocks ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(selected ? null : o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function VitalInput({
  label,
  value,
  onChange,
  decimal,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
}) {
  return (
    <View style={styles.vitalCell}>
      <Text style={styles.vitalLabel}>{label}</Text>
      <TextInput
        style={styles.vitalInput}
        value={value}
        onChangeText={onChange}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="—"
        placeholderTextColor={colors.textSub}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10, backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text },

  banner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  bannerText: { fontSize: 13, fontWeight: '700' },

  body: { flex: 1 },
  hint: { color: colors.textSub, fontSize: 13, lineHeight: 19, marginBottom: 16 },

  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 12, fontWeight: '800', color: colors.textSub,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },

  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, ...cardShadow,
  },
  segmentSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { color: colors.textMid, fontSize: 14, fontWeight: '700' },
  segmentTextSelected: { color: '#FFFFFF' },

  triageRow: { flexDirection: 'row', gap: 8 },
  triagePill: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1.5, backgroundColor: colors.white,
  },
  triageText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  input: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: colors.text, ...cardShadow,
  },
  notes: { minHeight: 96 },

  vitalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vitalCell: { width: '31%' },
  vitalLabel: { color: colors.textSub, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  vitalInput: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 10,
    fontSize: 15, color: colors.text, textAlign: 'center',
  },

  footer: {
    paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  submitBtn: {
    flexDirection: 'row', height: 54, borderRadius: radius.lg, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: colors.track },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
