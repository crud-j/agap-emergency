import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../../src/stores/auth.store';
import { cancelIncident, CancellationReason } from '../../src/services/api/incidents.api';
import { colors, cardShadow, radius } from '../../src/theme/tokens';

// ─── Reason metadata ─────────────────────────────────────────────────────────

const REASONS: { value: CancellationReason; label: string; description: string }[] = [
  {
    value: CancellationReason.ACCIDENTAL_TRIGGER,
    label: 'Accidental trigger',
    description: 'I pressed the button by mistake.',
  },
  {
    value: CancellationReason.SITUATION_RESOLVED,
    label: 'Situation resolved',
    description: 'The situation has been handled or resolved.',
  },
  {
    value: CancellationReason.DUPLICATE_REPORT,
    label: 'Already reported',
    description: 'This emergency was already reported by someone else.',
  },
  {
    value: CancellationReason.WRONG_APP,
    label: 'Wrong app / test',
    description: 'I used the app unintentionally or for testing.',
  },
  {
    value: CancellationReason.OTHER,
    label: 'Other reason',
    description: 'Another reason not listed above.',
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

type Stage = 'pick' | 'confirm' | 'submitting' | 'error';

export default function CancelIncidentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const [selected, setSelected] = useState<CancellationReason | null>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace(`/incidents/${id}` as any);
  }

  async function handleConfirm() {
    if (!selected || !id || !accessToken) return;
    setStage('submitting');
    setErrorMsg(null);

    try {
      await cancelIncident(id, selected, accessToken);

      // Invalidate cached incident data so any open screens reflect the new status
      qc.invalidateQueries({ queryKey: ['incident', id] });
      qc.invalidateQueries({ queryKey: ['my-incidents'] });

      // Navigate away; the incident is now CANCELLED
      router.replace('/incidents' as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not cancel report';
      setErrorMsg(msg);
      setStage('error');
    }
  }

  function handleRetry() {
    setStage('confirm');
    setErrorMsg(null);
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={handleBack}
            disabled={stage === 'submitting'}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Cancel Report</Text>
          <View style={s.backBtn} />
        </View>

        {/* Body */}
        {stage === 'pick' && (
          <>
            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
              <Text style={s.question}>Why are you cancelling this report?</Text>
              <Text style={s.sub}>
                This cannot be undone. If this is a real emergency, please call{' '}
                <Text style={s.highlight}>911</Text> or the{' '}
                <Text style={s.highlight}>MDRRMO hotline</Text>.
              </Text>

              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[s.option, selected === r.value && s.optionSelected]}
                  onPress={() => setSelected(r.value)}
                  activeOpacity={0.75}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected === r.value }}
                  accessibilityLabel={r.label}
                >
                  <View style={s.optionLeft}>
                    <View style={[s.radio, selected === r.value && s.radioSelected]}>
                      {selected === r.value && <View style={s.radioDot} />}
                    </View>
                  </View>
                  <View style={s.optionRight}>
                    <Text style={[s.optionLabel, selected === r.value && s.optionLabelSelected]}>
                      {r.label}
                    </Text>
                    <Text style={s.optionDesc}>{r.description}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={s.footer}>
              <TouchableOpacity
                style={[s.primaryBtn, !selected && s.primaryBtnDisabled]}
                onPress={() => selected && setStage('confirm')}
                disabled={!selected}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Continue to confirmation"
              >
                <Text style={s.primaryBtnText}>Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.ghostBtn}
                onPress={handleBack}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Keep my report active"
              >
                <Text style={s.ghostBtnText}>Keep Active</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {stage === 'confirm' && selected && (
          <View style={s.confirmWrap}>
            <View style={s.confirmCard}>
              <View style={s.warningIcon}>
                <Ionicons name="warning-outline" size={32} color={colors.amber} />
              </View>
              <Text style={s.confirmTitle}>Confirm Cancellation</Text>
              <Text style={s.confirmBody}>
                You have selected:{' '}
                <Text style={s.confirmReason}>
                  {REASONS.find((r) => r.value === selected)?.label}
                </Text>
              </Text>
              <Text style={s.confirmWarning}>
                This will mark your report as cancelled. Responders who have not yet been
                dispatched will be notified. If this is a genuine emergency, do not cancel —
                call <Text style={s.highlight}>911</Text> instead.
              </Text>
            </View>

            <View style={s.footer}>
              <TouchableOpacity
                style={s.dangerBtn}
                onPress={handleConfirm}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Confirm cancellation"
              >
                <Text style={s.dangerBtnText}>Cancel My Report</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.ghostBtn}
                onPress={() => setStage('pick')}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Go back to reason selection"
              >
                <Text style={s.ghostBtnText}>← Change Reason</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {stage === 'submitting' && (
          <View style={s.centred}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.submittingText}>Cancelling your report…</Text>
          </View>
        )}

        {stage === 'error' && (
          <View style={s.centred}>
            <Ionicons name="close-circle-outline" size={48} color={colors.danger} />
            <Text style={s.errorTitle}>Cancellation failed</Text>
            <Text style={s.errorMsg}>{errorMsg ?? 'An unexpected error occurred.'}</Text>
            <Text style={s.errorHint}>
              Your report is still active. If this is a real emergency,{' '}
              <Text style={s.highlight}>call 911</Text>.
            </Text>

            <View style={s.errorActions}>
              <TouchableOpacity
                style={s.primaryBtn}
                onPress={handleRetry}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <Text style={s.primaryBtnText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.ghostBtn}
                onPress={handleBack}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Keep my report active"
              >
                <Text style={s.ghostBtnText}>Keep Active</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safeArea: { flex: 1 },

  header: {
    minHeight: 56,
    paddingHorizontal: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },

  scroll: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 },

  question: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 10 },
  sub: { fontSize: 14, color: colors.textMid, lineHeight: 20, marginBottom: 20 },
  highlight: { fontWeight: '700', color: colors.text },

  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    marginBottom: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...cardShadow,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionLeft: { marginRight: 12, paddingTop: 2 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.track,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  optionRight: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 3 },
  optionLabelSelected: { color: colors.primary },
  optionDesc: { fontSize: 13, color: colors.textSub, lineHeight: 18 },

  footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8, gap: 10 },

  primaryBtn: {
    minHeight: 52, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary,
    ...cardShadow,
  },
  primaryBtnDisabled: { backgroundColor: colors.track },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },

  dangerBtn: {
    minHeight: 52, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.danger,
    ...cardShadow,
  },
  dangerBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },

  ghostBtn: {
    minHeight: 48, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  ghostBtnText: { fontSize: 14, fontWeight: '600', color: colors.textMid },

  // Confirm stage
  confirmWrap: { flex: 1 },
  confirmCard: {
    margin: 16,
    padding: 24,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    ...cardShadow,
  },
  warningIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.amberSoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 10, textAlign: 'center' },
  confirmBody: { fontSize: 15, color: colors.textMid, marginBottom: 14, textAlign: 'center' },
  confirmReason: { fontWeight: '700', color: colors.text },
  confirmWarning: { fontSize: 13, color: colors.textSub, lineHeight: 20, textAlign: 'center' },

  // Loading / Error
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  submittingText: { marginTop: 16, fontSize: 16, fontWeight: '600', color: colors.textMid },
  errorTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 16, marginBottom: 8 },
  errorMsg: { fontSize: 14, color: colors.danger, textAlign: 'center', marginBottom: 12 },
  errorHint: { fontSize: 13, color: colors.textSub, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  errorActions: { width: '100%', gap: 10 },
});
