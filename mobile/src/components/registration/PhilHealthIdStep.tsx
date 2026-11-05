/**
 * Registration: scan the PhilHealth ID before the account is created (MOD-01,
 * docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md §3–§4). Intro + consent, scanning, retry (attempt
 * n of 3, a reason per failure), and "Send to MDRRMO for review" after the third failed attempt.
 *
 * The guest "Report an emergency" button is on every state (CLAUDE.md rule 14): the ID check
 * gates account creation, never getting help.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ID_SCAN_MAX_ATTEMPTS, type IdScanResponse } from '@agap/shared';
import { useTranslations } from '../../hooks/useAccessibility';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { MDRRMO_HOTLINE } from '../../config/hotlines';
import {
  canOfferReview,
  countsAsAttempt,
  nextAttemptNumber,
  retryMessageKey,
  type CropRect,
  type IdScanFailureReason,
} from '../../lib/id-verification';
import { openDocumentScanner, processIdImage, type IdScanOutcome } from '../../services/id-scan/philhealth-scan';
import IdCameraFallback from './IdCameraFallback';

export type IdStep = 'id_intro' | 'id_scanning' | 'id_retry';

/** Same as the registration request's slow notice (plan §4.4). */
const SLOW_NOTICE_MS = 15_000;

interface Props {
  step: IdStep;
  onStepChange: (step: IdStep) => void;
  /** From the Bocaue geo-fence check that ran just before; the scan endpoint checks it again. */
  coords: { latitude: number; longitude: number };
  /** A message to show on the intro, e.g. "your scan expired". */
  notice?: string | null;
  onVerified: (result: IdScanResponse) => void;
  onOutsideServiceArea: () => void;
  onReportEmergency: () => void;
  onSignIn: () => void;
}

export default function PhilHealthIdStep({
  step,
  onStepChange,
  coords,
  notice,
  onVerified,
  onOutsideServiceArea,
  onReportEmergency,
  onSignIn,
}: Props) {
  const t = useTranslations();
  const { isOnline } = useNetworkStatus();

  const [consent, setConsent] = useState(false);
  const [consentHint, setConsentHint] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lastReason, setLastReason] = useState<IdScanFailureReason | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [slow, setSlow] = useState(false);
  /** Whether the capture in progress is the "Send to MDRRMO for review" one. */
  const reviewRun = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (step !== 'id_scanning') {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [step]);

  function settleFailure(reason: IdScanFailureReason) {
    if (reason === 'OUTSIDE_SERVICE_AREA') {
      onOutsideServiceArea();
      return;
    }
    if (reason === 'CONSENT_REQUIRED') {
      setConsent(false);
      onStepChange('id_intro');
      return;
    }
    if (countsAsAttempt(reason)) setFailedAttempts((n) => n + 1);
    setLastReason(reason);
    onStepChange('id_retry');
  }

  function settle(outcome: IdScanOutcome) {
    if (!mounted.current) return;
    if (outcome.kind === 'success') {
      onVerified(outcome.result);
      return;
    }
    settleFailure(outcome.reason);
  }

  async function upload(uri: string, crop?: CropRect) {
    onStepChange('id_scanning');
    const outcome = await processIdImage(uri, {
      ...(crop ? { crop } : {}),
      attemptNumber: nextAttemptNumber(failedAttempts),
      latitude: coords.latitude,
      longitude: coords.longitude,
      requestReview: reviewRun.current,
    });
    settle(outcome);
  }

  async function startScan(review: boolean) {
    if (!consent) {
      setConsentHint(true);
      onStepChange('id_intro');
      return;
    }
    if (!isOnline) {
      setLastReason('OFFLINE');
      onStepChange('id_retry');
      return;
    }
    reviewRun.current = review;
    setLastReason(null);

    if (useFallback) {
      setFallbackOpen(true);
      return;
    }
    onStepChange('id_scanning');
    const capture = await openDocumentScanner();
    if (!mounted.current) return;
    if (capture.kind === 'image') {
      await upload(capture.uri);
    } else if (capture.kind === 'scanner_unavailable') {
      setUseFallback(true);
      setFallbackOpen(true);
    } else {
      onStepChange(failedAttempts > 0 ? 'id_retry' : 'id_intro');
    }
  }

  function closeFallback() {
    setFallbackOpen(false);
    onStepChange(failedAttempts > 0 ? 'id_retry' : 'id_intro');
  }

  function onFallbackCaptured(uri: string, crop: CropRect) {
    setFallbackOpen(false);
    void upload(uri, crop);
  }

  function reportEmergency() {
    setFallbackOpen(false);
    onReportEmergency();
  }

  const offline = !isOnline || lastReason === 'OFFLINE';
  const reviewOffered = canOfferReview(failedAttempts) && lastReason !== 'ID_ALREADY_REGISTERED';

  return (
    <View style={styles.container}>
      {step === 'id_intro' && (
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="card-outline" size={40} color="#0D6053" />
          </View>
          <Text style={styles.heading}>{t.registration.idIntroTitle}</Text>
          <Text style={styles.body}>{t.registration.idIntroBody}</Text>

          {notice ? <Banner icon="time-outline" text={notice} tone="warning" /> : null}

          <View style={styles.points}>
            <Point icon="eye-outline" text={t.registration.idWhatWeRead} />
            <Point icon="help-circle-outline" text={t.registration.idWhyWeRead} />
            <Point icon="trash-outline" text={t.registration.idDeleted} />
            <Point icon="card-outline" text={t.registration.idOnlyPhilHealth} />
          </View>

          <TouchableOpacity
            testID="id-consent-checkbox"
            style={styles.consentRow}
            activeOpacity={0.8}
            onPress={() => {
              setConsent((v) => !v);
              setConsentHint(false);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
          >
            <View style={[styles.checkbox, consent && styles.checkboxActive]}>
              {consent && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
            <Text style={styles.consentText}>{t.registration.idConsentLabel}</Text>
          </TouchableOpacity>
          {consentHint && !consent ? <Text style={styles.errorText}>{t.registration.idConsentRequired}</Text> : null}

          {offline ? <OfflineCard /> : null}

          <PrimaryButton
            testID="id-scan-btn"
            icon="scan-outline"
            label={t.registration.idScanBtn}
            dimmed={!consent}
            onPress={() => void startScan(false)}
          />
        </View>
      )}

      {step === 'id_scanning' && (
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <ActivityIndicator size="large" color="#0D6053" />
          </View>
          <Text style={styles.heading}>{t.registration.idScanning}</Text>
          <Text style={styles.body}>{slow ? t.registration.idScanningSlow : t.registration.idScanningSub}</Text>
        </View>
      )}

      {step === 'id_retry' && (
        <View style={styles.card}>
          <View style={[styles.iconWrap, styles.iconWrapWarning]}>
            <Ionicons name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={40} color="#D97706" />
          </View>
          <Text style={styles.heading}>{offline ? t.registration.idOfflineTitle : t.registration.idRetryTitle}</Text>
          {failedAttempts > 0 && !offline ? (
            <Text style={styles.attempt}>
              {t.registration.idAttempt(Math.min(failedAttempts, ID_SCAN_MAX_ATTEMPTS), ID_SCAN_MAX_ATTEMPTS)}
            </Text>
          ) : null}

          {offline ? (
            <OfflineCard />
          ) : lastReason ? (
            <Text style={styles.body}>{t.registration[retryMessageKey(lastReason)] as string}</Text>
          ) : null}

          {useFallback ? <Banner icon="camera-outline" text={t.registration.idScannerUnavailable} tone="info" /> : null}

          {lastReason === 'ID_ALREADY_REGISTERED' ? (
            <PrimaryButton icon="log-in-outline" label={t.registration.idSignInInstead} onPress={onSignIn} />
          ) : (
            <PrimaryButton
              testID="id-scan-again-btn"
              icon={offline ? 'refresh-outline' : 'scan-outline'}
              label={offline ? t.registration.idTryAgain : t.registration.idScanAgainBtn}
              onPress={() => void startScan(false)}
            />
          )}

          {reviewOffered && !offline ? (
            <View style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>{t.registration.idReviewOfferTitle}</Text>
              <Text style={styles.reviewBody}>{t.registration.idReviewOfferBody}</Text>
              <TouchableOpacity
                testID="id-send-review-btn"
                style={styles.reviewBtn}
                activeOpacity={0.85}
                onPress={() => void startScan(true)}
                accessibilityRole="button"
              >
                <Ionicons name="people-outline" size={18} color="#0D6053" style={{ marginRight: 8 }} />
                <Text style={styles.reviewBtnText}>{t.registration.idSendReviewBtn}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}

      {/* Guest SOS: always reachable from every ID step (rule 14). */}
      <TouchableOpacity
        testID="id-report-emergency-btn"
        activeOpacity={0.85}
        style={styles.emergencyButton}
        onPress={reportEmergency}
        accessibilityRole="button"
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.05)']}
          locations={[0, 0.4, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.gradientOverlay}
        >
          <Ionicons name="information-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.buttonText}>{t.registration.emergencyBtn}</Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signInRow} onPress={onSignIn} hitSlop={{ top: 12, bottom: 12 }}>
        <Text style={styles.signInText}>
          {t.registration.alreadyHave} <Text style={styles.signInLink}>{t.registration.signIn}</Text>
        </Text>
      </TouchableOpacity>

      <Modal visible={fallbackOpen} animationType="slide" onRequestClose={closeFallback} statusBarTranslucent>
        <IdCameraFallback onCaptured={onFallbackCaptured} onCancel={closeFallback} onReportEmergency={reportEmergency} />
      </Modal>
    </View>
  );
}

function OfflineCard() {
  const t = useTranslations();
  return (
    <View style={styles.offlineCard}>
      <Text style={styles.offlineText}>{t.registration.idOfflineBody}</Text>
      <View style={styles.callRow}>
        <TouchableOpacity style={styles.callBtn} onPress={() => void Linking.openURL('tel:911')} accessibilityRole="button">
          <Ionicons name="call" size={16} color="#DC2626" />
          <Text style={styles.callText}>{t.registration.idCall911}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.callBtn}
          onPress={() => void Linking.openURL(`tel:${MDRRMO_HOTLINE}`)}
          accessibilityRole="button"
        >
          <Ionicons name="call" size={16} color="#DC2626" />
          <Text style={styles.callText}>{t.registration.idCallMdrrmo}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={18} color="#0D6053" style={{ marginTop: 1 }} />
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

function Banner({ icon, text, tone }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone: 'warning' | 'info' }) {
  const warning = tone === 'warning';
  return (
    <View style={[styles.banner, warning ? styles.bannerWarning : styles.bannerInfo]}>
      <Ionicons name={icon} size={16} color={warning ? '#B45309' : '#0D6053'} style={{ marginRight: 8 }} />
      <Text style={[styles.bannerText, { color: warning ? '#92400E' : '#0D6053' }]}>{text}</Text>
    </View>
  );
}

function PrimaryButton({
  icon,
  label,
  onPress,
  dimmed,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  dimmed?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.primaryButton, dimmed && styles.primaryButtonDimmed]}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', '#0A5448']}
        locations={[0, 0.38, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.gradientOverlay}
      >
        <Ionicons name={icon} size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.buttonText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  card: { alignItems: 'center', paddingVertical: 16, gap: 12 },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0FBF9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconWrapWarning: { backgroundColor: '#FFFBEB' },
  heading: { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center' },
  body: { fontSize: 15, color: '#4B5563', textAlign: 'center', lineHeight: 22 },
  attempt: { fontSize: 13, fontWeight: '700', color: '#B45309' },
  points: {
    alignSelf: 'stretch',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  point: { flexDirection: 'row', gap: 10 },
  pointText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 19 },
  consentRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 1,
  },
  checkboxActive: { backgroundColor: '#0D6053', borderColor: '#0D6053' },
  consentText: { flex: 1, fontSize: 14, color: '#111827', lineHeight: 20, fontWeight: '600' },
  errorText: { alignSelf: 'stretch', fontSize: 12, color: '#EF4444' },
  banner: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  bannerWarning: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  bannerInfo: { backgroundColor: '#F0FBF9', borderColor: '#CCEBE6' },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  primaryButton: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0D6053',
    overflow: 'hidden',
    marginTop: 4,
  },
  primaryButtonDimmed: { opacity: 0.55 },
  gradientOverlay: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  reviewCard: {
    alignSelf: 'stretch',
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F0FBF9',
    borderWidth: 1,
    borderColor: '#CCEBE6',
    gap: 8,
  },
  reviewTitle: { fontSize: 15, fontWeight: '800', color: '#0D6053' },
  reviewBody: { fontSize: 13, color: '#374151', lineHeight: 19 },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: '#0D6053',
    backgroundColor: '#FFFFFF',
    marginTop: 4,
  },
  reviewBtnText: { fontSize: 13, fontWeight: '700', color: '#0D6053' },
  offlineCard: {
    alignSelf: 'stretch',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 10,
  },
  offlineText: { fontSize: 13, color: '#991B1B', lineHeight: 19 },
  callRow: { flexDirection: 'row', gap: 10 },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FFFFFF',
  },
  callText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  emergencyButton: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FF5C6F',
    overflow: 'hidden',
  },
  signInRow: { alignItems: 'center', paddingVertical: 8 },
  signInText: { fontSize: 14, color: '#4B5563' },
  signInLink: { fontWeight: '700', color: '#0D6053' },
});
