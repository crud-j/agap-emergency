import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  IncidentType,
  isCoordinateInBocaue,
  ReporterStatus,
  LANDMARK_MAX_LENGTH,
  intakeQuestionsFor,
  visibleIntakeQuestions,
  type IntakeAnswers,
  type IntakeOption,
  type IntakeQuestion,
} from '@agap/shared';
import { useIncidentStore } from '@/src/stores/incident.store';
import { useAuthStore } from '@/src/stores/auth.store';
import { reverseGeocode } from '@/src/services/api/locations.api';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type GpsState = 'locating' | 'ready' | 'unavailable';
type Answers = IntakeAnswers;

// ─── Type-specific questions (MOD-09) ────────────────────────────────────────
//
// Questions and options come from the shared intake catalog in @agap/shared,
// so the backend validates the same list and the dashboard labels answers the
// same way. Each question maps to a dispatch decision; nothing is required.
// Icons below are presentation only.

const OPTION_ICONS: Record<string, IoniconName> = {
  'vehicles.motorcycle': 'bicycle',
  'vehicles.tricycle':   'bicycle-outline',
  'vehicles.car':        'car',
  'vehicles.truck':      'bus',
  'vehicles.pedestrian': 'walk',
  'burning.house':       'home',
  'burning.store':       'storefront',
  'burning.fireworks':   'sparkles',
  'burning.warehouse':   'business',
  'burning.vehicle':     'car',
  'burning.wires':       'flash',
  'burning.grass':       'leaf',
  'event.flood':         'water',
  'event.wind':          'thunderstorm',
  'event.tree':          'leaf',
  'event.collapse':      'home',
  'event.wires':         'flash',
};

// ─── Reporter's own situation ────────────────────────────────────────────────
//
// Replaces "Who needs help?". The reporter is usually a bystander, so asking
// whether the reporter is also hurt is what actually changes dispatch (a call
// back, a rescue for the caller). Reporter and patient stay separate: only
// "I need help too" records the reporter as a patient; otherwise no patient is
// guessed, and an unknown patient never blocks dispatch.

const SELF_OPTIONS: { key: ReporterStatus; label: string; desc: string; icon: IoniconName }[] = [
  { key: ReporterStatus.SAFE,       label: "I'm safe",        desc: "I'm reporting for others",   icon: 'shield-checkmark' },
  { key: ReporterStatus.NEEDS_HELP, label: 'I need help too', desc: "I'm hurt or still in danger", icon: 'hand-left' },
];

const AFFECTED_OPTIONS: { key: string; label: string; icon: IoniconName }[] = [
  { key: '1',       label: '1',        icon: 'person'              },
  { key: '2-5',     label: '2–5',      icon: 'people'              },
  { key: '5+',      label: '5+',       icon: 'people-circle'       },
  { key: 'unknown', label: 'Not sure', icon: 'help-circle-outline' },
];

const TYPE_META: Partial<Record<IncidentType, { label: string; icon: IoniconName; color: string; notes: string }>> = {
  [IncidentType.ROAD_ACCIDENT]: {
    label: 'Road incident',
    icon: 'car',
    color: '#2563EB',
    notes: 'e.g. Motorcycle and jeep collided, rider is on the road, near the Petron station',
  },
  [IncidentType.FIRE]: {
    label: 'Fire',
    icon: 'flame',
    color: '#EA580C',
    notes: 'e.g. Second floor of a two-storey house, black smoke, residents are outside',
  },
  [IncidentType.NATURAL_DISASTER]: {
    label: 'Natural disaster',
    icon: 'thunderstorm',
    color: '#0E7490',
    notes: 'e.g. Family of 5 on the roof, water still rising, road to the house is impassable',
  },
  [IncidentType.FLOOD]: {
    label: 'Natural disaster',
    icon: 'thunderstorm',
    color: '#0E7490',
    notes: 'e.g. Family of 5 on the roof, water still rising, road to the house is impassable',
  },
};

const FALLBACK_META = {
  label: 'Emergency',
  icon: 'alert-circle' as IoniconName,
  color: '#0D6053',
  notes: 'Anything responders should know before they arrive',
};

// ─── Design tokens (shared with the bottom nav) ──────────────────────────────

const C = {
  bg:          '#F2F5F8',
  white:       '#FFFFFF',
  ink:         '#1D2B3A',
  muted:       '#66768A',
  primary:     '#0D6053',
  primarySoft: '#E6F4F1',
  surface:     '#F6F8FA',
  border:      '#E9ECEB',
  green:       '#16A34A',
  greenSoft:   '#DCFCE7',
  red:         '#DC2626',
  redSoft:     '#FEF2F2',
  amber:       '#B45309',
  amberSoft:   '#FEF3E2',
};

const shadow = (opacity: number, radius: number, y: number, elevation: number) =>
  Platform.select({
    ios: { shadowColor: '#18231F', shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height: y } },
    android: { elevation },
  });

// ─── Main screen ──────────────────────────────────────────────────────────────

/**
 * MOD-09 / MOD-11 / MOD-14 — Step 4 of 4.
 * Collects optional context that changes what dispatch sends: location and
 * landmark, type-specific questions, people count, the reporter's own
 * situation, a photo, and notes. Nothing here blocks submission — every field
 * is optional (Architectural Rule #5).
 */
export default function IncidentDetailsScreen() {
  const router      = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const {
    draft,
    setDescription,
    setPatient,
    setLocation,
    clearLocation,
    setAffectedCount,
    setHazards,
    setManualAddress,
    setIntake,
  } = useIncidentStore();

  const prompts = intakeQuestionsFor(draft.type);
  const meta    = (draft.type && TYPE_META[draft.type]) || FALLBACK_META;

  const [description,   setDescriptionText]   = useState(draft.description ?? '');
  const [answers,       setAnswers]           = useState<Answers>(() => draft.intake?.answers ?? {});
  const [selfStatus,    setSelfStatus]        = useState<ReporterStatus | null>(
    () => draft.intake?.reporterStatus ?? (draft.patient?.isReporter ? ReporterStatus.NEEDS_HELP : null),
  );
  const [affectedCount, setAffectedCountLocal] = useState<string | null>(draft.affectedCount);
  const [landmark,      setLandmark]          = useState(() => draft.intake?.landmark ?? draft.manualAddress ?? '');
  const [gps,            setGps]            = useState<GpsState>('locating');
  const [gpsAccuracy,    setGpsAccuracy]    = useState<number | null>(null);
  const [reverseAddress, setReverseAddress] = useState<string | null>(null);

  const photoUri = draft.photoUris?.[0];
  const videoUri = draft.videoUri;
  const shown    = visibleIntakeQuestions(prompts, answers);
  const answered = shown.filter((p) => answers[p.key]?.length).length;

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            applyCoords(loc.coords);
            return;
          } catch { /* fall through to last-known */ }
        }
        const last = await Location.getLastKnownPositionAsync();
        if (last) applyCoords(last.coords);
        else       setGps('unavailable');
      } catch {
        setGps('unavailable');
      }
    })();
  // setLocation is a stable Zustand action
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyCoords(coords: Location.LocationObjectCoords) {
    if (
      draft.isGuestReport &&
      !isCoordinateInBocaue(coords.latitude, coords.longitude)
    ) {
      clearLocation();
      setGps('unavailable');
      return;
    }
    setLocation({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy ?? undefined });
    setGpsAccuracy(coords.accuracy ?? null);
    setGps('ready');
    // Route geocoding through the backend (MOD-12) — keeps vendor abstraction consistent.
    void resolveAddress(coords.latitude, coords.longitude);
  }

  async function resolveAddress(lat: number, lng: number) {
    try {
      const result = await reverseGeocode(lat, lng, accessToken ?? undefined);
      if (!result.formatted_address) return;
      setReverseAddress(result.formatted_address);
      // Send the resolved address with the report so dispatch sees a street, not just coordinates.
      const current = useIncidentStore.getState().draft.location;
      if (current && current.lat === lat && current.lng === lng) {
        setLocation({ ...current, address: result.formatted_address, barangay: result.barangay ?? current.barangay });
      }
    } catch { /* non-critical — GPS coords are already persisted */ }
  }

  function toggleAnswer(prompt: IntakeQuestion, option: IntakeOption) {
    setAnswers((prev) => {
      const current = prev[prompt.key] ?? [];
      const selected = current.includes(option.value);
      let next: string[];
      if (!prompt.multi) {
        next = selected ? [] : [option.value];
      } else if (selected) {
        next = current.filter((v) => v !== option.value);
      } else if (option.exclusive) {
        next = [option.value];
      } else {
        const exclusive = new Set(prompt.options.filter((o) => o.exclusive).map((o) => o.value));
        next = [...current.filter((v) => !exclusive.has(v)), option.value];
      }
      const updated = { ...prev };
      if (next.length) updated[prompt.key] = next;
      else delete updated[prompt.key];
      return updated;
    });
  }

  function submit() {
    if (
      draft.isGuestReport &&
      (!draft.location || !isCoordinateInBocaue(draft.location.lat, draft.location.lng))
    ) {
      Alert.alert(
        'Bocaue location required',
        'A report without an account can only be sent with a GPS location inside Bocaue Municipality.',
        [{ text: 'Retry location', onPress: () => router.replace('/emergency/location') }],
      );
      return;
    }
    const trimmedLandmark = landmark.trim();
    // Answers to questions that are no longer shown (e.g. water depth after
    // un-ticking flooding) are not sent.
    const shownAnswers: Answers = Object.fromEntries(
      shown.filter((q) => answers[q.key]?.length).map((q) => [q.key, answers[q.key]!]),
    );

    setDescription(description.trim() || null);
    setPatient(selfStatus === ReporterStatus.NEEDS_HELP ? { isReporter: true, isUnknown: false } : null);
    setAffectedCount(affectedCount);
    // The backend builds the dispatcher-readable lines from the structured answers.
    setHazards([]);
    setIntake({ answers: shownAnswers, reporterStatus: selfStatus, landmark: trimmedLandmark || null });
    // Without GPS the landmark is also the address dispatch works from.
    setManualAddress(gps === 'unavailable' ? trimmedLandmark || null : null);
    router.push('/emergency/transmission');
  }

  const gpsReady       = gps === 'ready';
  const gpsLocating    = gps === 'locating';
  const gpsUnavailable = gps === 'unavailable';

  return (
    <View style={styles.root}>

      {/* ── Fixed header ────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={20} color={C.ink} />
          </TouchableOpacity>

          <View style={styles.brandRow}>
            <Image
              source={require('@/assets/icons/agap-icon.png')}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="AGAP — Incident Management Platform"
            />
          </View>

          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>4 / 4</Text>
          </View>
        </View>

        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: '100%' }]} />
        </View>

        <View style={styles.pageTitleRow}>
          <View style={[styles.typeIcon, { backgroundColor: `${meta.color}18` }]}>
            <Ionicons name={meta.icon} size={22} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageEyebrow}>{meta.label}</Text>
            <Text style={styles.pageTitle}>Tell responders what you see</Text>
          </View>
        </View>
        <View style={styles.sendNowNote}>
          <Ionicons name="flash" size={13} color={C.primary} style={{ marginRight: 6 }} />
          <Text style={styles.sendNowText}>
            Every question is optional. If it's urgent, send now.
          </Text>
        </View>
      </SafeAreaView>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── 1. Location (MOD-11 / MOD-12) ──────────────────────────────── */}
        <Section icon="location" title="Where is it?">
          <View style={[
            styles.gpsRow,
            gpsReady       && styles.gpsRowOk,
            gpsUnavailable && styles.gpsRowWarn,
          ]}>
            {gpsLocating ? (
              <ActivityIndicator size="small" color={C.primary} style={{ marginRight: 10 }} />
            ) : (
              <Ionicons
                name={gpsReady ? 'navigate-circle' : 'alert-circle'}
                size={20}
                color={gpsReady ? C.green : C.red}
                style={{ marginRight: 10 }}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.gpsTitle, { color: gpsReady ? C.green : gpsUnavailable ? C.red : C.ink }]}>
                {gpsLocating    ? 'Getting your location…'
                 : gpsReady     ? `GPS location captured${gpsAccuracy != null ? ` (±${Math.round(gpsAccuracy)} m)` : ''}`
                 :                'GPS unavailable. Your report will still be sent.'}
              </Text>
              {reverseAddress && (
                <Text style={styles.gpsAddress} numberOfLines={2}>{reverseAddress}</Text>
              )}
            </View>
          </View>

          <Text style={styles.fieldLabel}>
            {gpsUnavailable ? 'Street or nearest landmark' : 'Nearest landmark'}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Beside the barangay hall, Purok 3"
            placeholderTextColor="#9CA3AF"
            value={landmark}
            onChangeText={setLandmark}
            maxLength={LANDMARK_MAX_LENGTH}
            returnKeyType="done"
            accessibilityLabel="Nearest landmark"
          />
          <Text style={styles.fieldHint}>
            Responders find you faster with a landmark than with GPS alone.
          </Text>
        </Section>

        {/* ── 2. Type-specific questions (MOD-09) ────────────────────────── */}
        <Section
          icon="clipboard"
          title="What's happening?"
          badge={shown.length ? `${answered} of ${shown.length}` : undefined}
        >
          {shown.map((prompt, pi) => (
            <View key={prompt.key} style={[styles.promptBlock, pi > 0 && styles.promptDivider]}>
              <Text style={styles.promptQuestion}>{prompt.question}</Text>
              {prompt.multi && <Text style={styles.promptMeta}>Select all that apply</Text>}
              {prompt.hint && (
                <View style={styles.hintRow}>
                  <Ionicons name="information-circle" size={13} color={C.amber} style={{ marginRight: 5 }} />
                  <Text style={styles.hintText}>{prompt.hint}</Text>
                </View>
              )}
              <View style={styles.pillRow}>
                {prompt.options.map((opt) => {
                  const active = !!answers[prompt.key]?.includes(opt.value);
                  const icon = OPTION_ICONS[`${prompt.key}.${opt.value}`];
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.pill, active && styles.pillActive]}
                      activeOpacity={0.8}
                      onPress={() => toggleAnswer(prompt, opt)}
                      accessibilityRole={prompt.multi ? 'checkbox' : 'radio'}
                      accessibilityState={prompt.multi ? { checked: active } : { selected: active }}
                      accessibilityLabel={`${prompt.question} ${opt.label}`}
                    >
                      {active ? (
                        <Ionicons name="checkmark-circle" size={15} color={C.primary} style={{ marginRight: 6 }} />
                      ) : icon ? (
                        <Ionicons name={icon} size={15} color={C.muted} style={{ marginRight: 6 }} />
                      ) : null}
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </Section>

        {/* ── 3. People ──────────────────────────────────────────────────── */}
        <Section icon="people" title="People">
          <Text style={styles.promptQuestion}>How many are hurt or in danger?</Text>
          <View style={styles.countRow}>
            {AFFECTED_OPTIONS.map((opt) => {
              const active = affectedCount === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.countCard, active && styles.countCardActive]}
                  activeOpacity={0.8}
                  onPress={() => setAffectedCountLocal(active ? null : opt.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`People hurt or in danger: ${opt.label}`}
                >
                  <Ionicons name={opt.icon} size={18} color={active ? C.primary : C.muted} />
                  <Text style={[styles.countText, active && styles.countTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.promptDivider} />

          <Text style={[styles.promptQuestion, { marginTop: 14 }]}>Are you hurt or in danger yourself?</Text>
          <View style={styles.selfRow}>
            {SELF_OPTIONS.map((opt) => {
              const active = selfStatus === opt.key;
              const needsHelp = opt.key === ReporterStatus.NEEDS_HELP;
              const tone = needsHelp ? C.red : C.primary;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.selfCard,
                    active && { borderColor: tone, backgroundColor: needsHelp ? C.redSoft : C.primarySoft },
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setSelfStatus(active ? null : opt.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${opt.label}. ${opt.desc}`}
                >
                  <Ionicons name={opt.icon} size={20} color={active ? tone : C.muted} />
                  <Text style={[styles.selfLabel, active && { color: tone }]}>{opt.label}</Text>
                  <Text style={styles.selfDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* ── 4. Photo / Video (MOD-10) ──────────────────────────────────── */}
        <Section icon={videoUri ? 'videocam' : 'camera'} title="Photo or video">
          <View style={styles.photoContainer}>
            {videoUri ? (
              <>
                <View style={styles.videoPoster}>
                  <View style={styles.videoPlayCircle}>
                    <Ionicons name="videocam" size={26} color={C.primary} />
                  </View>
                  <Text style={styles.videoCapturedTitle}>Video captured</Text>
                  <Text style={styles.videoCapturedSub}>It will be sent with your report</Text>
                </View>
                <RetakeButton label="Re-record" onPress={() => router.replace('/emergency/capture?retake=1')} />
              </>
            ) : photoUri ? (
              <>
                <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
                <RetakeButton label="Retake" onPress={() => router.replace('/emergency/capture?retake=1')} />
              </>
            ) : (
              <TouchableOpacity
                style={styles.photoEmpty}
                onPress={() => router.replace('/emergency/capture?retake=1')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Add a photo or video"
              >
                <View style={styles.photoEmptyIcon}>
                  <Ionicons name="camera" size={22} color={C.primary} />
                </View>
                <Text style={styles.photoEmptyTitle}>Add a photo or video</Text>
                <Text style={styles.photoEmptyDesc}>Only if it's safe to take one</Text>
              </TouchableOpacity>
            )}
          </View>
        </Section>

        {/* ── 5. Notes ───────────────────────────────────────────────────── */}
        <Section icon="create" title="Anything else?">
          <TextInput
            style={styles.textArea}
            placeholder={meta.notes}
            placeholderTextColor="#9CA3AF"
            value={description}
            onChangeText={setDescriptionText}
            multiline
            maxLength={1000}
            textAlignVertical="top"
            accessibilityLabel="Anything else responders should know"
          />
          <Text style={styles.charCount}>{description.length} / 1000</Text>
        </Section>

        <View style={styles.disclaimerRow}>
          <Ionicons name="call-outline" size={14} color={C.muted} style={{ marginRight: 6 }} />
          <Text style={styles.disclaimerText}>
            AGAP complements, never replaces, 911 and the Bocaue MDRRMO hotline.
          </Text>
        </View>

        {/* Bottom padding for fixed footer */}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── Fixed submit footer ──────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={submit}
          activeOpacity={0.87}
          accessibilityRole="button"
          accessibilityLabel="Send emergency report"
        >
          <View style={styles.submitIconWrap}>
            <Ionicons name="send" size={18} color={C.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.submitTitle}>Send Emergency Report</Text>
            <Text style={styles.submitSubtitle}>
              {answered > 0 || affectedCount || selfStatus
                ? 'Your answers go straight to the dispatcher'
                : 'You can send now, even without answers'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  badge,
  children,
}: {
  icon: IoniconName;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={icon} size={16} color={C.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {badge && (
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function RetakeButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.photoOverlay}>
      <TouchableOpacity style={styles.photoOverlayBtn} onPress={onPress} activeOpacity={0.85}>
        <Ionicons name="refresh" size={14} color={C.white} style={{ marginRight: 5 }} />
        <Text style={styles.photoOverlayText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },

  // ── Header ─────────────────────────────────────────────────────────────────
  safeTop: { backgroundColor: C.white, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  header:  {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  brandRow:  { flex: 1, flexDirection: 'row', alignItems: 'center' },
  brandLogo: { width: 122, height: 36 },
  stepBadge: { backgroundColor: C.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  stepBadgeText: { fontSize: 11, fontWeight: '800', color: C.white, letterSpacing: 0.2 },

  progressBarTrack: { height: 3, backgroundColor: '#E8EDF2' },
  progressBarFill:  { height: 3, backgroundColor: C.primary },

  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  typeIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  pageEyebrow: { fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.7 },
  pageTitle:   { fontSize: 21, fontWeight: '800', color: C.ink, letterSpacing: -0.3, marginTop: 2 },
  sendNowNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
  },
  sendNowText: { flex: 1, fontSize: 12, fontWeight: '600', color: C.primary },

  // ── Body ───────────────────────────────────────────────────────────────────
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },

  sectionCard: {
    backgroundColor: C.white,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    padding: 16,
    marginBottom: 14,
    ...shadow(0.06, 12, 4, 2),
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: C.ink, letterSpacing: -0.1 },
  sectionBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: C.surface },
  sectionBadgeText: { fontSize: 11, fontWeight: '700', color: C.muted },

  // ── Location ───────────────────────────────────────────────────────────────
  gpsRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 12, borderRadius: 16,
    backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  gpsRowOk:   { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  gpsRowWarn: { backgroundColor: C.redSoft, borderColor: '#FECACA' },
  gpsTitle:   { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  gpsAddress: { fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 17 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 14, marginBottom: 8 },
  fieldHint:  { fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 16 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#DCE3EA',
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.white,
  },

  // ── Questions ──────────────────────────────────────────────────────────────
  promptBlock:   { paddingVertical: 12 },
  promptDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  promptQuestion:{ fontSize: 14, fontWeight: '700', color: C.ink, lineHeight: 20, marginBottom: 10 },
  promptMeta:    { fontSize: 11.5, color: C.muted, marginTop: -6, marginBottom: 10 },
  hintRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginTop: -4, marginBottom: 10,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, backgroundColor: C.amberSoft,
  },
  hintText: { flex: 1, fontSize: 11.5, color: C.amber, fontWeight: '600', lineHeight: 16 },
  pillRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
  },
  pillActive:     { borderColor: C.primary, backgroundColor: C.primarySoft },
  pillText:       { fontSize: 13, fontWeight: '600', color: C.ink },
  pillTextActive: { color: C.primary, fontWeight: '800' },

  // ── People ─────────────────────────────────────────────────────────────────
  countRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  countCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  countCardActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
  countText:       { fontSize: 13, fontWeight: '700', color: C.ink },
  countTextActive: { color: C.primary, fontWeight: '800' },
  selfRow:  { flexDirection: 'row', gap: 10 },
  selfCard: {
    flex: 1,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  selfLabel: { fontSize: 14, fontWeight: '800', color: C.ink, marginTop: 8 },
  selfDesc:  { fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 16 },

  // ── Photo ──────────────────────────────────────────────────────────────────
  photoContainer: { height: 170, borderRadius: 16, overflow: 'hidden', backgroundColor: C.surface },
  photo: { width: '100%', height: '100%' },
  photoOverlay: { position: 'absolute', bottom: 10, right: 10 },
  photoOverlayBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(29,43,58,0.82)',
    borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  photoOverlayText: { color: C.white, fontSize: 12, fontWeight: '700' },
  photoEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#D7E0E8', borderStyle: 'dashed',
    borderRadius: 16,
    gap: 6, padding: 20,
  },
  photoEmptyIcon: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  photoEmptyTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  photoEmptyDesc:  { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18 },
  videoPoster: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0F172A',
    gap: 8, padding: 20,
  },
  videoPlayCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  videoCapturedTitle: { fontSize: 14, fontWeight: '700', color: C.white },
  videoCapturedSub:   { fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },

  // ── Notes ──────────────────────────────────────────────────────────────────
  textArea: {
    minHeight: 104,
    borderWidth: 1,
    borderColor: '#DCE3EA',
    borderRadius: 16,
    padding: 14,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.white,
    lineHeight: 21,
  },
  charCount: { fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 8 },

  disclaimerRow:  { flexDirection: 'row', alignItems: 'flex-start', marginTop: 2, paddingHorizontal: 6 },
  disclaimerText: { flex: 1, fontSize: 11.5, color: C.muted, lineHeight: 17 },

  // ── Submit footer ──────────────────────────────────────────────────────────
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    paddingHorizontal: 16,
    ...shadow(0.08, 12, -3, 8),
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.red,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  submitIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  submitTitle:    { fontSize: 15, fontWeight: '800', color: C.white },
  submitSubtitle: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
});
