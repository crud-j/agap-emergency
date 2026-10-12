import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, StatusBar, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useIncidentStore } from '@/src/stores/incident.store';
import { useAuthStore } from '@/src/stores/auth.store';
import { submitIncident, uploadIncidentPhoto } from '@/src/services/api/incidents.api';
import { OfflineQueueService } from '@/src/services/offline/offline-queue.service';
import type { CreateIncidentInput } from '@agap/shared';
import { ReporterType } from '@agap/shared';
import { colors, cardShadow, radius } from '@/src/theme/tokens';

type TransmissionState = 'submitting' | 'success' | 'queued' | 'failed';

// ─── Submitting ────────────────────────────────────────────────────────────────

function SubmittingView() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.center}>
      <View style={styles.iconWrap}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="sync-outline" size={40} color={colors.primary} />
        </Animated.View>
      </View>
      <Text style={styles.heading}>Sending Emergency Report</Text>
      <Text style={styles.sub}>Connecting to MDRRMO Operations Center…</Text>
    </View>
  );
}

// ─── Success ──────────────────────────────────────────────────────────────────

function SuccessView() {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.center}>
      <Animated.View style={[styles.iconWrap, styles.iconWrapSuccess, { transform: [{ scale }], opacity }]}>
        <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
      </Animated.View>
      <Text style={styles.heading}>Emergency Report Sent</Text>
      <Text style={styles.sub}>
        The MDRRMO Operations Center has been notified.{'\n'}A dispatcher will review your report shortly.
      </Text>
      <View style={[styles.infoCard, styles.successCard]}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
        <Text style={styles.infoCardText}>Help is on the way. Stay calm and keep your phone nearby.</Text>
      </View>
    </View>
  );
}

// ─── Queued (Offline) ─────────────────────────────────────────────────────────

function QueuedView({ onViewReports }: { onViewReports: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return (
    <View style={styles.queuedRoot}>
      {/* Icon */}
      <View style={[styles.iconWrap, styles.iconWrapAmber]}>
        <Ionicons name="cloud-offline-outline" size={42} color={colors.amber} />
      </View>

      {/* Headlines */}
      <Text style={styles.heading}>Report Saved</Text>
      <View style={styles.noConnRow}>
        <Ionicons name="cloud-offline-outline" size={15} color={colors.amber} />
        <Text style={styles.noConnText}>No Internet Connection</Text>
      </View>

      {/* Explanation card */}
      <View style={[styles.card, styles.explainCard]}>
        <Text style={styles.explainTitle}>Your report is stored safely on this device.</Text>
        <Text style={styles.explainBody}>
          It will be sent automatically to the MDRRMO Operations Center the moment your internet
          connection is restored. No action is needed from you.
        </Text>
      </View>

      {/* Steps */}
      <View style={[styles.card, styles.stepsCard]}>
        <Step done icon="save-outline"        label="Report saved on your device" />
        <StepConnector />
        <Step wait icon="wifi-outline"         label="Waiting for internet connection" pulse={pulse} />
        <StepConnector />
        <Step wait icon="cloud-upload-outline" label="Will send automatically" dim />
      </View>

      {/* Emergency hotline reminder */}
      <View style={[styles.card, styles.hotlineCard]}>
        <View style={styles.hotlineHeader}>
          <Ionicons name="warning-outline" size={16} color={colors.danger} />
          <Text style={styles.hotlineBold}>If this is a life emergency, do not wait.</Text>
        </View>
        <Text style={styles.hotlineLine}>
          <Text style={styles.hotlineNum}>Call 911</Text>
          <Text style={styles.hotlineSub}> or the </Text>
          <Text style={styles.hotlineNum}>MDRRMO Hotline</Text>
          <Text style={styles.hotlineSub}> immediately.</Text>
        </Text>
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={onViewReports}
        accessibilityRole="button"
        accessibilityLabel="View my saved reports"
      >
        <Text style={styles.primaryBtnText}>View My Reports</Text>
      </TouchableOpacity>
    </View>
  );
}

interface StepProps {
  done?: boolean;
  wait?: boolean;
  dim?: boolean;
  icon: string;
  label: string;
  pulse?: Animated.Value;
}

function Step({ done, wait, dim, icon, label, pulse }: StepProps) {
  const dotColor = done ? colors.primary : wait && !dim ? colors.amber : colors.track;
  const textColor = done ? colors.text : dim ? colors.textSub : colors.textMid;

  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepDot, { backgroundColor: dotColor }]}>
        {done && <Ionicons name="checkmark" size={10} color="#fff" />}
        {wait && !dim && pulse && (
          <Animated.View style={[StyleSheet.absoluteFill, styles.stepPulseRing, { opacity: pulse }]} />
        )}
      </View>
      <Ionicons name={icon as any} size={16} color={done ? colors.primary : dim ? colors.textSub : colors.textMid} style={styles.stepIcon} />
      <Text style={[styles.stepLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function StepConnector() {
  return <View style={styles.stepConnector} />;
}

// ─── Failed ───────────────────────────────────────────────────────────────────

function FailedView({ error, onRetry, onHome }: { error: string | null; onRetry: () => void; onHome: () => void }) {
  return (
    <View style={styles.center}>
      <View style={[styles.iconWrap, styles.iconWrapDanger]}>
        <Ionicons name="close-circle" size={48} color={colors.danger} />
      </View>
      <Text style={styles.heading}>Transmission Failed</Text>
      <Text style={styles.sub}>
        {error ?? 'We could not send or save your emergency report.'}
      </Text>

      <View style={[styles.card, styles.hotlineCard, { marginTop: 24 }]}>
        <View style={styles.hotlineHeader}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={[styles.hotlineBold, { color: colors.danger }]}>
            Call 911 or the MDRRMO Hotline immediately.
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.primaryBtnText}>Try Again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.ghostBtn} onPress={onHome} accessibilityRole="button">
        <Text style={styles.ghostBtnText}>Go to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TransmissionScreen() {
  const router = useRouter();
  const { draft, setActiveIncidentId } = useIncidentStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [txState, setTxState] = useState<TransmissionState>('submitting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    transmit();
  }, []);

  async function transmit() {
    if (!draft.idempotencyKey || !draft.type) {
      setError('Incomplete emergency report. Please try again.');
      setTxState('failed');
      return;
    }

    const payload: CreateIncidentInput = {
      type: draft.type,
      idempotencyKey: draft.idempotencyKey,
      description: draft.description ?? undefined,
      lat: draft.location?.lat,
      lng: draft.location?.lng,
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
      setTxState('success');

      if (accessToken && draft.photoUris.length > 0) {
        draft.photoUris.forEach((uri) => {
          uploadIncidentPhoto(result.id, uri, accessToken).catch(() => undefined);
        });
      }

      setTimeout(() => router.replace(`/incidents/${result.id}` as any), 2500);
    } catch {
      try {
        await OfflineQueueService.enqueue(payload);
        setTxState('queued');
      } catch {
        setError('Could not queue the emergency. Call 911 immediately.');
        setTxState('failed');
      }
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {txState === 'submitting' && <SubmittingView />}
        {txState === 'success'    && <SuccessView />}
        {txState === 'queued'     && (
          <QueuedView onViewReports={() => router.replace('/incidents' as any)} />
        )}
        {txState === 'failed'     && (
          <FailedView
            error={error}
            onRetry={() => { setTxState('submitting'); transmit(); }}
            onHome={() => router.replace('/home' as any)}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, paddingVertical: 32,
  },

  // ─── Shared icon wrap ──────────────────────────────────────────────────────
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
    marginBottom: 24,
  },
  iconWrapSuccess: { backgroundColor: colors.primarySoft },
  iconWrapAmber:   { backgroundColor: '#FFF8E6' },
  iconWrapDanger:  { backgroundColor: colors.dangerSoft },

  // ─── Typography ────────────────────────────────────────────────────────────
  heading: {
    fontSize: 24, fontWeight: '800', color: colors.text,
    textAlign: 'center', marginBottom: 10,
  },
  sub: {
    fontSize: 15, fontWeight: '500', color: colors.textMid,
    textAlign: 'center', lineHeight: 22, marginBottom: 16,
  },

  // ─── Queued root ───────────────────────────────────────────────────────────
  queuedRoot: {
    flex: 1, alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 40, paddingBottom: 24,
  },
  noConnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 24,
  },
  noConnText: {
    fontSize: 15, fontWeight: '700', color: colors.amber,
  },

  // ─── Cards ─────────────────────────────────────────────────────────────────
  card: {
    width: '100%', borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 12,
    ...cardShadow,
  },
  explainCard: {},
  explainTitle: {
    fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6,
  },
  explainBody: {
    fontSize: 13, fontWeight: '400', color: colors.textMid, lineHeight: 20,
  },

  // ─── Steps card ────────────────────────────────────────────────────────────
  stepsCard: { paddingVertical: 14 },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 2,
  },
  stepDot: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10, flexShrink: 0,
  },
  stepPulseRing: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.amber,
  },
  stepIcon: { marginRight: 8, flexShrink: 0 },
  stepLabel: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  stepConnector: {
    width: 2, height: 10, backgroundColor: colors.track,
    marginLeft: 9, marginVertical: 1,
  },

  // ─── Hotline card ──────────────────────────────────────────────────────────
  hotlineCard: {
    backgroundColor: colors.dangerSoft,
    borderColor: 'rgba(212,72,88,0.20)',
  },
  hotlineHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6,
  },
  hotlineBold: {
    fontSize: 13, fontWeight: '800', color: colors.text, flexShrink: 1,
  },
  hotlineLine: { fontSize: 14, lineHeight: 21 },
  hotlineNum: { fontWeight: '800', color: colors.danger },
  hotlineSub: { color: colors.textMid },

  // ─── Info card (success) ───────────────────────────────────────────────────
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: radius.lg, padding: 14,
    marginTop: 8, width: '100%',
  },
  successCard: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1, borderColor: 'rgba(13,96,83,0.18)',
  },
  infoCardText: {
    flex: 1, fontSize: 13, fontWeight: '500', color: colors.textMid, lineHeight: 20,
  },

  // ─── Buttons ───────────────────────────────────────────────────────────────
  primaryBtn: {
    width: '100%', minHeight: 52, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, marginTop: 8,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },

  ghostBtn: {
    width: '100%', minHeight: 48, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, marginTop: 8,
  },
  ghostBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },
});
