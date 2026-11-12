import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  KeyboardAvoidingView,
  LayoutAnimation,
  AccessibilityInfo,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBack } from '@/src/lib/navigation';
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

// Haptics are a nicety — loaded defensively so a missing native module never
// breaks the report flow (same pattern as HoldToSOS).
type HapticsModule = typeof import('expo-haptics');
let Haptics: HapticsModule | null = null;
try {
  Haptics = require('expo-haptics') as HapticsModule;
} catch {
  Haptics = null;
}
const tapFeedback = () => { Haptics?.selectionAsync().catch(() => {}); };

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

// ─── Design tokens ───────────────────────────────────────────────────────────
//
// Text tokens are checked for ≥ 4.5:1 contrast against the backgrounds they
// sit on (white, surface, and their own soft tint).

const C = {
  bg:          '#F2F5F8',
  white:       '#FFFFFF',
  ink:         '#1D2B3A',
  muted:       '#5B6B7F',
  placeholder: '#7A8797',
  primary:     '#0D6053',
  primarySoft: '#E6F4F1',
  surface:     '#F6F8FA',
  border:      '#E3E8EE',
  inputBorder: '#D3DBE4',
  green:       '#15803D',
  greenSoft:   '#F0FDF4',
  greenLine:   '#BBF7D0',
  red:         '#DC2626',
  redText:     '#B91C1C',
  redSoft:     '#FEF2F2',
  redLine:     '#FECACA',
  amber:       '#B45309',
  amberSoft:   '#FEF3E2',
};

const shadow = (opacity: number, radius: number, y: number, elevation: number) =>
  Platform.select({
    ios: { shadowColor: '#18231F', shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height: y } },
    android: { elevation },
  });

const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

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
  const insets      = useSafeAreaInsets();
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
  const [reduceMotion,   setReduceMotion]   = useState(false);

  // Guards against a double tap pushing the transmission screen twice. Reset
  // whenever this screen regains focus (e.g. the reporter comes back to edit).
  const sendingRef = useRef(false);
  useFocusEffect(useCallback(() => { sendingRef.current = false; }, []));

  const photoUri = draft.photoUris?.[0];
  const videoUri = draft.videoUri;
  const shown    = visibleIntakeQuestions(prompts, answers);
  const answered = shown.filter((p) => answers[p.key]?.length).length;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void locate();
  // Once, on opening the screen (setLocation is a stable Zustand action).
  }, []);

  async function locate() {
    setGps('locating');
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
  }

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
    tapFeedback();
    // Follow-up questions (showIf) slide in instead of jumping the layout.
    if (!reduceMotion && prompts.some((q) => q.showIf?.key === prompt.key)) {
      LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    }
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
    if (sendingRef.current) return;
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
    sendingRef.current = true;
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
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

  // Capture (MOD-10) replaces this screen rather than stacking on top of it, so
  // on return it remounts from the Zustand draft — local state typed before
  // leaving must be saved here first or it's lost on remount.
  function goToCapture() {
    setDescription(description.trim() || null);
    setPatient(selfStatus === ReporterStatus.NEEDS_HELP ? { isReporter: true, isUnknown: false } : null);
    setAffectedCount(affectedCount);
    setIntake({ answers, reporterStatus: selfStatus, landmark: landmark.trim() || null });
    router.replace('/emergency/capture');
  }

  const gpsReady       = gps === 'ready';
  const gpsLocating    = gps === 'locating';
  const gpsUnavailable = gps === 'unavailable';

  const detailCount =
    answered +
    (affectedCount ? 1 : 0) +
    (selfStatus ? 1 : 0) +
    (landmark.trim() ? 1 : 0) +
    (photoUri || videoUri ? 1 : 0) +
    (description.trim() ? 1 : 0);

  const gpsTitle = gpsLocating
    ? 'Getting your location…'
    : gpsReady
      ? `Location captured${gpsAccuracy != null ? ` · ±${Math.round(gpsAccuracy)} m` : ''}`
      : 'GPS unavailable';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >

      {/* ── Compact fixed header ────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => goBack()}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={C.ink} />
          </TouchableOpacity>

          <View style={styles.headerText}>
            <Text style={styles.headerEyebrow}>Step 4 of 4</Text>
            <Text style={styles.headerTitle} accessibilityRole="header">Details</Text>
          </View>

          <View style={[styles.typeChip, { backgroundColor: `${meta.color}14` }]}>
            <Ionicons name={meta.icon} size={15} color={meta.color} />
            <Text style={[styles.typeChipText, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
          </View>
        </View>

        <View
          style={styles.progressRow}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Step 4 of 4"
          accessibilityValue={{ min: 1, max: 4, now: 4 }}
        >
          {[0, 1, 2, 3].map((i) => <View key={i} style={styles.progressSeg} />)}
        </View>
      </SafeAreaView>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >

        {/* ── Intro ──────────────────────────────────────────────────────── */}
        <View style={styles.intro}>
          <Image
            source={require('@/assets/icons/agap-icon.png')}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="AGAP — Incident Management Platform"
          />
          <Text style={styles.introTitle} accessibilityRole="header">Tell responders what you see</Text>
          <View style={styles.sendNowNote}>
            <Ionicons name="flash" size={16} color={C.primary} style={styles.noteIcon} />
            <Text style={styles.sendNowText}>
              Every question is optional. If it's urgent, send now.
            </Text>
          </View>
        </View>

        {/* ── 1. Location (MOD-11 / MOD-12) ──────────────────────────────── */}
        <Section icon="location" title="Where is it?">
          <View
            style={[
              styles.gpsRow,
              gpsReady       && styles.gpsRowOk,
              gpsUnavailable && styles.gpsRowWarn,
            ]}
            accessibilityLiveRegion="polite"
          >
            <View style={[
              styles.gpsIcon,
              gpsReady       && { backgroundColor: C.greenLine },
              gpsUnavailable && { backgroundColor: C.redLine },
            ]}>
              {gpsLocating ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Ionicons
                  name={gpsReady ? 'navigate' : 'alert'}
                  size={16}
                  color={gpsReady ? C.green : C.redText}
                />
              )}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.gpsTitle, { color: gpsReady ? C.green : gpsUnavailable ? C.redText : C.ink }]}>
                {gpsTitle}
              </Text>
              {reverseAddress ? (
                <Text style={styles.gpsAddress} numberOfLines={2}>{reverseAddress}</Text>
              ) : gpsUnavailable ? (
                <Text style={styles.gpsAddress}>Your report will still be sent. Add a street or landmark below.</Text>
              ) : null}
            </View>
            {gpsUnavailable && (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => { tapFeedback(); void locate(); }}
                accessibilityRole="button"
                accessibilityLabel="Try getting GPS location again"
              >
                <Ionicons name="refresh" size={15} color={C.redText} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.fieldLabel} nativeID="landmarkLabel">
            {gpsUnavailable ? 'Street or nearest landmark' : 'Nearest landmark'}
          </Text>
          <View style={styles.inputWrap}>
            <Ionicons name="flag-outline" size={18} color={C.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="e.g. Beside the barangay hall, Purok 3"
              placeholderTextColor={C.placeholder}
              value={landmark}
              onChangeText={setLandmark}
              maxLength={LANDMARK_MAX_LENGTH}
              returnKeyType="done"
              accessibilityLabel={gpsUnavailable ? 'Street or nearest landmark' : 'Nearest landmark'}
              accessibilityLabelledBy="landmarkLabel"
            />
          </View>
          <Text style={styles.fieldHint}>
            Responders find you faster with a landmark than with GPS alone.
          </Text>
        </Section>

        {/* ── 2. Type-specific questions (MOD-09) ────────────────────────── */}
        {shown.length > 0 && (
          <Section
            icon="clipboard"
            title="What's happening?"
            badge={`${answered} of ${shown.length}`}
            badgeLabel={`${answered} of ${shown.length} questions answered`}
            badgeDone={answered === shown.length}
          >
            {shown.map((prompt, pi) => (
              <View key={prompt.key} style={[styles.promptBlock, pi > 0 && styles.promptDivider]}>
                <Text style={styles.promptQuestion}>{prompt.question}</Text>
                {prompt.multi && <Text style={styles.promptMeta}>Select all that apply</Text>}
                {prompt.hint && (
                  <View style={styles.hintRow}>
                    <Ionicons name="information-circle" size={16} color={C.amber} style={styles.noteIcon} />
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
                        activeOpacity={0.75}
                        onPress={() => toggleAnswer(prompt, opt)}
                        accessibilityRole={prompt.multi ? 'checkbox' : 'radio'}
                        accessibilityState={prompt.multi ? { checked: active } : { selected: active }}
                        accessibilityLabel={`${prompt.question} ${opt.label}`}
                      >
                        {active ? (
                          <Ionicons name="checkmark-circle" size={17} color={C.white} style={styles.pillIcon} />
                        ) : icon ? (
                          <Ionicons name={icon} size={17} color={C.muted} style={styles.pillIcon} />
                        ) : null}
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </Section>
        )}

        {/* ── 3. People ──────────────────────────────────────────────────── */}
        <Section icon="people" title="People">
          <Text style={styles.promptQuestion}>How many are hurt or in danger?</Text>
          <View style={styles.countRow} accessibilityRole="radiogroup">
            {AFFECTED_OPTIONS.map((opt) => {
              const active = affectedCount === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.countCard, active && styles.countCardActive]}
                  activeOpacity={0.75}
                  onPress={() => { tapFeedback(); setAffectedCountLocal(active ? null : opt.key); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`People hurt or in danger: ${opt.label}`}
                >
                  <Ionicons name={opt.icon} size={20} color={active ? C.white : C.muted} />
                  <Text style={[styles.countText, active && styles.countTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.promptDivider} />

          <Text style={[styles.promptQuestion, styles.selfQuestion]}>Are you hurt or in danger yourself?</Text>
          <View style={styles.selfRow} accessibilityRole="radiogroup">
            {SELF_OPTIONS.map((opt) => {
              const active = selfStatus === opt.key;
              const needsHelp = opt.key === ReporterStatus.NEEDS_HELP;
              const tone = needsHelp ? C.redText : C.primary;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.selfCard,
                    active && { borderColor: needsHelp ? C.red : C.primary, backgroundColor: needsHelp ? C.redSoft : C.primarySoft },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => { tapFeedback(); setSelfStatus(active ? null : opt.key); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${opt.label}. ${opt.desc}`}
                >
                  <View style={styles.selfTop}>
                    <View style={[styles.selfIcon, active && { backgroundColor: C.white }]}>
                      <Ionicons name={opt.icon} size={20} color={active ? tone : C.muted} />
                    </View>
                    <View style={[styles.radio, active && { borderColor: tone }]}>
                      {active && <View style={[styles.radioDot, { backgroundColor: tone }]} />}
                    </View>
                  </View>
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
                <RetakeButton label="Re-record" a11yLabel="Re-record video" onPress={goToCapture} />
              </>
            ) : photoUri ? (
              <>
                <Image
                  source={{ uri: photoUri }}
                  style={styles.photo}
                  resizeMode="cover"
                  accessibilityRole="image"
                  accessibilityLabel="Captured photo of the incident"
                />
                <RetakeButton label="Retake" a11yLabel="Retake photo" onPress={goToCapture} />
              </>
            ) : (
              <TouchableOpacity
                style={styles.photoEmpty}
                onPress={goToCapture}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Add a photo or video"
                accessibilityHint="Only if it's safe to take one"
              >
                <View style={styles.photoEmptyIcon}>
                  <Ionicons name="camera" size={24} color={C.primary} />
                </View>
                <Text style={styles.photoEmptyTitle}>Add a photo or video</Text>
                <View style={styles.safetyRow}>
                  <Ionicons name="warning-outline" size={14} color={C.amber} style={styles.noteIcon} />
                  <Text style={styles.photoEmptyDesc}>Only if it's safe to take one</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </Section>

        {/* ── 5. Notes ───────────────────────────────────────────────────── */}
        <Section icon="create" title="Anything else?">
          <TextInput
            style={styles.textArea}
            placeholder={meta.notes}
            placeholderTextColor={C.placeholder}
            value={description}
            onChangeText={setDescriptionText}
            multiline
            maxLength={1000}
            textAlignVertical="top"
            accessibilityLabel="Anything else responders should know"
          />
          <Text
            style={[styles.charCount, description.length >= 900 && { color: C.amber }]}
            accessibilityLabel={`${description.length} of 1000 characters used`}
          >
            {description.length} / 1000
          </Text>
        </Section>

        <View style={styles.disclaimerRow}>
          <Ionicons name="call-outline" size={16} color={C.muted} style={styles.noteIcon} />
          <Text style={styles.disclaimerText}>
            AGAP complements, never replaces, 911 and the Bocaue MDRRMO hotline.
          </Text>
        </View>
      </ScrollView>

      {/* ── Submit footer ────────────────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={submit}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Send emergency report"
          accessibilityHint={detailCount > 0
            ? `${detailCount} ${detailCount === 1 ? 'detail' : 'details'} added`
            : 'You can send now, even without answers'}
        >
          <View style={styles.submitIconWrap}>
            <Ionicons name="send" size={18} color={C.white} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.submitTitle}>Send Emergency Report</Text>
            <Text style={styles.submitSubtitle}>
              {detailCount > 0
                ? `${detailCount} ${detailCount === 1 ? 'detail' : 'details'} added · goes straight to dispatch`
                : 'You can send now, even without answers'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.white} />
        </TouchableOpacity>
      </View>

    </KeyboardAvoidingView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  badge,
  badgeLabel,
  badgeDone,
  children,
}: {
  icon: IoniconName;
  title: string;
  badge?: string;
  badgeLabel?: string;
  badgeDone?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={icon} size={17} color={C.primary} />
        </View>
        <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
        {badge && (
          <View
            style={[styles.sectionBadge, badgeDone && styles.sectionBadgeDone]}
            accessible
            accessibilityLabel={badgeLabel ?? badge}
          >
            {badgeDone && <Ionicons name="checkmark" size={12} color={C.primary} style={{ marginRight: 3 }} />}
            <Text style={[styles.sectionBadgeText, badgeDone && { color: C.primary }]}>{badge}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function RetakeButton({ label, a11yLabel, onPress }: { label: string; a11yLabel: string; onPress: () => void }) {
  return (
    <View style={styles.photoOverlay}>
      <TouchableOpacity
        style={styles.photoOverlayBtn}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
      >
        <Ionicons name="refresh" size={16} color={C.white} style={{ marginRight: 6 }} />
        <Text style={styles.photoOverlayText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
//
// Type scale: 12 caption · 14 secondary · 15/16 body & inputs · 17 section · 24 title.
// Every tappable target is ≥ 44 pt (directly or via hitSlop).

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  // ── Header ─────────────────────────────────────────────────────────────────
  safeTop: {
    backgroundColor: C.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 12,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  headerText:    { flex: 1 },
  headerEyebrow: { fontSize: 12, fontWeight: '700', color: C.muted, letterSpacing: 0.3 },
  headerTitle:   { fontSize: 18, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    maxWidth: 170,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999,
  },
  typeChipText: { fontSize: 13, fontWeight: '800', flexShrink: 1 },

  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingBottom: 12 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.primary },

  // ── Body ───────────────────────────────────────────────────────────────────
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },

  intro: { paddingHorizontal: 4, marginBottom: 16 },
  brandLogo: { width: 104, height: 30, marginBottom: 10 },
  introTitle: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.4, lineHeight: 30 },
  sendNowNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: C.primarySoft,
  },
  noteIcon:    { marginRight: 8 },
  sendNowText: { flex: 1, fontSize: 14, fontWeight: '600', color: C.primary, lineHeight: 20 },

  sectionCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    padding: 16,
    marginBottom: 14,
    ...shadow(0.05, 10, 3, 1),
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  sectionBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  sectionBadgeDone: { backgroundColor: C.primarySoft, borderColor: C.primarySoft },
  sectionBadgeText: { fontSize: 12, fontWeight: '700', color: C.muted },

  // ── Location ───────────────────────────────────────────────────────────────
  gpsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 16,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  gpsRowOk:   { backgroundColor: C.greenSoft, borderColor: C.greenLine },
  gpsRowWarn: { backgroundColor: C.redSoft, borderColor: C.redLine },
  gpsIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  gpsTitle:   { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  gpsAddress: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: 44, paddingHorizontal: 12,
    borderRadius: 999, backgroundColor: C.white,
    borderWidth: 1, borderColor: C.redLine,
  },
  retryText: { fontSize: 14, fontWeight: '700', color: C.redText },

  fieldLabel: { fontSize: 14, fontWeight: '700', color: C.ink, marginTop: 16, marginBottom: 8 },
  fieldHint:  { fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 18 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 14,
    backgroundColor: C.white,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: C.ink, paddingVertical: 12 },

  // ── Questions ──────────────────────────────────────────────────────────────
  promptBlock:    { paddingVertical: 14 },
  promptDivider:  { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  promptQuestion: { fontSize: 15, fontWeight: '700', color: C.ink, lineHeight: 21, marginBottom: 10 },
  promptMeta:     { fontSize: 13, color: C.muted, marginTop: -6, marginBottom: 10 },
  hintRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginTop: -2, marginBottom: 12,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 12, backgroundColor: C.amberSoft,
  },
  hintText: { flex: 1, fontSize: 13, color: C.amber, fontWeight: '600', lineHeight: 18 },
  pillRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
  },
  pillActive:     { borderColor: C.primary, backgroundColor: C.primary },
  pillIcon:       { marginRight: 6 },
  pillText:       { fontSize: 14, fontWeight: '600', color: C.ink },
  pillTextActive: { color: C.white, fontWeight: '700' },

  // ── People ─────────────────────────────────────────────────────────────────
  countRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  countCard: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  countCardActive: { borderColor: C.primary, backgroundColor: C.primary },
  countText:       { fontSize: 14, fontWeight: '700', color: C.ink },
  countTextActive: { color: C.white, fontWeight: '800' },

  selfQuestion: { marginTop: 16 },
  selfRow:  { flexDirection: 'row', gap: 10 },
  selfCard: {
    flex: 1,
    minHeight: 44,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  selfTop:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  selfIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
  },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: C.inputBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot:  { width: 10, height: 10, borderRadius: 5 },
  selfLabel: { fontSize: 15, fontWeight: '800', color: C.ink, marginTop: 10 },
  selfDesc:  { fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 18 },

  // ── Photo ──────────────────────────────────────────────────────────────────
  photoContainer: { height: 180, borderRadius: 16, overflow: 'hidden', backgroundColor: C.surface },
  photo: { width: '100%', height: '100%' },
  photoOverlay: { position: 'absolute', bottom: 10, right: 10 },
  photoOverlayBtn: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: 44,
    backgroundColor: 'rgba(29,43,58,0.88)',
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  photoOverlayText: { color: C.white, fontSize: 14, fontWeight: '700' },
  photoEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.inputBorder, borderStyle: 'dashed',
    borderRadius: 16,
    gap: 6, padding: 20,
  },
  photoEmptyIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  photoEmptyTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  safetyRow:       { flexDirection: 'row', alignItems: 'center' },
  photoEmptyDesc:  { fontSize: 13, color: C.amber, fontWeight: '600', lineHeight: 18 },
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
  videoCapturedTitle: { fontSize: 15, fontWeight: '700', color: C.white },
  videoCapturedSub:   { fontSize: 13, color: 'rgba(255,255,255,0.78)', textAlign: 'center' },

  // ── Notes ──────────────────────────────────────────────────────────────────
  textArea: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.white,
    lineHeight: 22,
  },
  charCount: { fontSize: 12, color: C.muted, textAlign: 'right', marginTop: 8 },

  disclaimerRow:  { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4, paddingHorizontal: 6 },
  disclaimerText: { flex: 1, fontSize: 13, color: C.muted, lineHeight: 19 },

  // ── Submit footer ──────────────────────────────────────────────────────────
  footer: {
    backgroundColor: C.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingTop: 12,
    paddingHorizontal: 16,
    ...shadow(0.08, 12, -3, 8),
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    backgroundColor: C.red,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...shadow(0.25, 10, 4, 4),
  },
  submitIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  submitTitle:    { fontSize: 16, fontWeight: '800', color: C.white },
  submitSubtitle: { fontSize: 12, fontWeight: '600', color: C.white, marginTop: 2 },
});
