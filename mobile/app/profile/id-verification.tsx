import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { goBack } from '@/src/lib/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_ID_DOCUMENT_TYPE,
  IdVerificationErrorCode,
  type IdClaimResponse,
  type IdDocumentType,
  type IdScanResponse,
} from '@agap/shared';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { ID_STATUS_QUERY_KEY } from '../../src/components/profile/id-status-card';
import NameFields, { EMPTY_NAME, type NameValues } from '../../src/components/registration/NameFields';
import IdScanStep, { type IdStep } from '../../src/components/registration/IdScanStep';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { IdVerificationError, canCreateAccount, checkTypedName, retryMessageKey, typedIdName } from '../../src/lib/id-verification';
import { claimIdScan } from '../../src/services/api/id-verification.api';
import { useAuthStore } from '../../src/stores/auth.store';

type Phase = 'locating' | 'location_error' | 'outside' | IdStep | 'name' | 'done';

const GPS_TIMEOUT_MS = 15_000;

/**
 * Scanning an ID again from the profile (MOD-01, plan §8), after a rejection, a withdrawal or a
 * release. The same steps and rules as registration, for a signed-in citizen, who may choose a
 * different ID than last time (National ID plan §3).
 * "Report an emergency" is on every step (rule 14): this never stands in the way of getting help.
 */
export default function IdVerificationScreen() {
  const router = useRouter();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);

  const [phase, setPhase] = useState<Phase>('locating');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  /** Here rather than in the ID step, because that step unmounts on the name form. Set on the chooser before it's used. */
  const [documentType, setDocumentType] = useState<IdDocumentType>(DEFAULT_ID_DOCUMENT_TYPE);
  const [notice, setNotice] = useState<string | null>(null);
  const [scan, setScan] = useState<IdScanResponse | null>(null);
  const [name, setName] = useState<NameValues>(EMPTY_NAME);
  const [nameChecked, setNameChecked] = useState(false);
  const [reviewChosen, setReviewChosen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<IdClaimResponse['identityVerification'] | null>(null);

  async function locate() {
    setPhase('locating');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) throw new Error('LOCATION_DENIED');
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: true }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('GPS_TIMEOUT')), GPS_TIMEOUT_MS);
        }),
      ]);
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setPhase('id_choose');
    } catch {
      setPhase('location_error');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  useEffect(() => {
    void locate();
    // Once, on opening the screen.
  }, []);

  function restartScan(message: string | null) {
    setScan(null);
    setName(EMPTY_NAME);
    setNameChecked(false);
    setReviewChosen(false);
    setError(null);
    setNotice(message);
    setPhase('id_intro');
  }

  function reportEmergency() {
    router.push('/emergency/sos');
  }

  const typedName = typedIdName(name);
  const nameMatch = checkTypedName(typedName, scan?.nameOnId ?? null);
  const canSubmit =
    typedName !== null &&
    canCreateAccount({
      nameMatches: nameMatch?.matches === true,
      reviewChosen,
      reviewScan: scan?.reviewRequired === true,
    });

  async function submit() {
    setNameChecked(typedName !== null);
    if (!scan || !typedName || !canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await claimIdScan({
        idVerificationToken: scan.token,
        lastName: typedName.last,
        firstName: typedName.first,
        ...(typedName.middle ? { middleName: typedName.middle } : {}),
        ...(typedName.suffix ? { suffix: typedName.suffix } : {}),
        ...(scan.reviewRequired || reviewChosen ? { requestReview: true } : {}),
      });
      await updateUser({ full_name: result.fullName });
      await queryClient.invalidateQueries({ queryKey: ID_STATUS_QUERY_KEY });
      setOutcome(result.identityVerification);
      setPhase('done');
    } catch (err) {
      if (err instanceof IdVerificationError) {
        if (err.code === IdVerificationErrorCode.ID_SCAN_EXPIRED) {
          restartScan(t.registration.idScanExpired);
          return;
        }
        if (err.code === IdVerificationErrorCode.ID_ALREADY_REGISTERED) {
          setError(t.registration[retryMessageKey('ID_ALREADY_REGISTERED', documentType)] as string);
          return;
        }
        if (err.code === IdVerificationErrorCode.NAME_DOES_NOT_MATCH_ID) {
          setError(t.registration.createDisabledHint);
          return;
        }
      }
      setError(t.registration.idErrorServer);
    } finally {
      setSubmitting(false);
    }
  }

  const idStep = phase === 'id_choose' || phase === 'id_intro' || phase === 'id_scanning' || phase === 'id_retry';

  return (
    <View style={styles.root}>
      <ScreenHeader title={t.profile.idRescanTitle} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {phase === 'locating' && (
          <Message>
            <ActivityIndicator size="large" color="#0D6053" />
            <Text style={styles.body}>{t.profile.idRescanLocating}</Text>
          </Message>
        )}

        {phase === 'location_error' && (
          <Message>
            <Ionicons name="location-outline" size={40} color="#D97706" />
            <Text style={styles.body}>{t.profile.idRescanLocationError}</Text>
            <Action label={t.profile.idRescanRetry} onPress={() => void locate()} />
          </Message>
        )}

        {phase === 'outside' && (
          <Message>
            <Ionicons name="location-outline" size={40} color="#D97706" />
            <Text style={styles.body}>{t.profile.idRescanOutside}</Text>
            <Action label={t.profile.idRescanDone} onPress={() => goBack()} />
          </Message>
        )}

        {idStep && coords && (
          <IdScanStep
            step={phase}
            onStepChange={setPhase}
            documentType={documentType}
            onDocumentTypeChange={(type) => {
              setDocumentType(type);
              setNotice(null); // "Your scan expired" was about the last ID, not the one just chosen.
            }}
            coords={coords}
            notice={notice}
            onVerified={(result) => {
              setScan(result);
              setNotice(null);
              setPhase('name');
            }}
            onOutsideServiceArea={() => setPhase('outside')}
            onReportEmergency={reportEmergency}
          />
        )}

        {phase === 'name' && scan && (
          <View style={styles.card}>
            <Text style={styles.intro}>{t.profile.idRescanNameIntro}</Text>
            <NameFields
              value={name}
              onChange={(next) => {
                setName(next);
                setNameChecked(false);
                setError(null);
              }}
              nameOnId={scan.nameOnId}
              shownMatch={nameChecked ? nameMatch : null}
              onNameBlur={() => setNameChecked(typedName !== null)}
              reviewChosen={reviewChosen}
              onReviewChange={setReviewChosen}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Action
              testID="id-rescan-submit-btn"
              label={t.profile.idRescanSubmit}
              onPress={() => void submit()}
              dimmed={!canSubmit}
              busy={submitting}
            />
          </View>
        )}

        {phase === 'done' && (
          <Message>
            <Ionicons
              name={outcome === 'AUTO_VERIFIED' ? 'checkmark-circle' : 'people-outline'}
              size={44}
              color="#0D6053"
            />
            <Text testID="id-rescan-result" style={styles.body}>
              {outcome === 'AUTO_VERIFIED' ? t.profile.idRescanVerified : t.profile.idRescanUnderReview}
            </Text>
            <Action label={t.profile.idRescanDone} onPress={() => goBack()} />
          </Message>
        )}

        {/* IdScanStep has its own on the ID steps. */}
        {!idStep && (
          <TouchableOpacity
            testID="id-rescan-report-emergency-btn"
            style={styles.emergency}
            onPress={reportEmergency}
            accessibilityRole="button"
          >
            <Ionicons name="alert-circle" size={16} color="#DC2626" />
            <Text style={styles.emergencyText}>{t.registration.emergencyBtn}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <View style={[styles.card, styles.message]}>{children}</View>;
}

function Action({
  label,
  onPress,
  dimmed,
  busy,
  testID,
}: {
  label: string;
  onPress: () => void;
  dimmed?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      {...(testID ? { testID } : {})}
      style={[styles.action, dimmed && styles.actionDimmed]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
    >
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionText}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F6F5' },
  scroll: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 18, borderWidth: 1, borderColor: '#DEE7E3' },
  message: { alignItems: 'center', gap: 14, paddingVertical: 28 },
  body: { fontSize: 15, color: '#4B5563', textAlign: 'center', lineHeight: 22 },
  intro: { fontSize: 14, color: '#4B5563', lineHeight: 20, marginBottom: 12 },
  error: { fontSize: 13, color: '#B91C1C', lineHeight: 19, marginBottom: 10 },
  action: { alignSelf: 'stretch', height: 50, borderRadius: 12, backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center' },
  actionDimmed: { opacity: 0.5 },
  actionText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  emergency: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 4 },
  emergencyText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
});
