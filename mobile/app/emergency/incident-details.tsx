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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { IncidentType } from '@agap/shared';
import { useIncidentStore } from '@/src/stores/incident.store';
import { useAuthStore } from '@/src/stores/auth.store';
import { reverseGeocode } from '@/src/services/api/locations.api';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type PatientChoice = 'me' | 'other' | 'unknown';
type GpsState = 'locating' | 'ready' | 'unavailable';

// ─── Type-specific quick prompts (MOD-09) ────────────────────────────────────

type PromptOption = { value: string; label: string };
type PromptDef    = { key: string; question: string; options: PromptOption[] };

const QUICK_PROMPTS: Partial<Record<IncidentType, PromptDef[]>> = {
  [IncidentType.ROAD_ACCIDENT]: [
    {
      key: 'injuries',
      question: 'Injuries visible?',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }],
    },
    {
      key: 'road_blocked',
      question: 'Road blocked?',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    },
  ],
  [IncidentType.FIRE]: [
    {
      key: 'trapped',
      question: 'Anyone trapped?',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }],
    },
    {
      key: 'gas',
      question: 'Gas or chemicals involved?',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }],
    },
  ],
  [IncidentType.FLOOD]: [
    {
      key: 'stranded',
      question: 'People stranded?',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    },
    {
      key: 'water_level',
      question: 'Approximate water level?',
      options: [
        { value: 'ankle', label: 'Ankle' },
        { value: 'knee',  label: 'Knee'  },
        { value: 'waist', label: 'Waist' },
        { value: 'above', label: 'Above waist' },
      ],
    },
  ],
};

// Human-readable hazard strings sent to the dispatcher
const HAZARD_LABELS: Record<string, Record<string, string>> = {
  injuries:    { yes: 'Injuries reported visible', no: 'No visible injuries' },
  road_blocked:{ yes: 'Road is blocked', no: 'Road passable' },
  trapped:     { yes: 'Person(s) may be trapped', unknown: 'Possible entrapment — unconfirmed' },
  gas:         { yes: 'Gas/chemicals may be involved', unknown: 'Possible gas/chemicals — unconfirmed' },
  stranded:    { yes: 'People are stranded' },
  water_level: {
    ankle: 'Water level: ankle-deep',
    knee:  'Water level: knee-deep',
    waist: 'Water level: waist-deep',
    above: 'Water level: above waist',
  },
};

function buildHazards(answers: Record<string, string>): string[] {
  return Object.entries(answers)
    .map(([k, v]) => HAZARD_LABELS[k]?.[v])
    .filter((x): x is string => Boolean(x));
}

// ─── Static option lists ─────────────────────────────────────────────────────

const RESPONSE_NEEDS: { key: string; label: string; icon: IoniconName; color: string }[] = [
  { key: 'ambulance',   label: 'Ambulance',    icon: 'medkit',           color: '#DC2626' },
  { key: 'fire_truck',  label: 'Fire Truck',   icon: 'flame',            color: '#EA580C' },
  { key: 'rescue_boat', label: 'Rescue Boat',  icon: 'boat',             color: '#2563EB' },
  { key: 'police',      label: 'Police',       icon: 'shield-checkmark', color: '#7C3AED' },
];

const AFFECTED_OPTIONS: { key: string; label: string; icon: IoniconName }[] = [
  { key: '1',       label: '1 person',    icon: 'person-outline'  },
  { key: '2-5',     label: '2–5 people',  icon: 'people-outline'  },
  { key: '5+',      label: '5+ people',   icon: 'people'          },
  { key: 'unknown', label: 'Unknown',     icon: 'help-circle-outline' },
];

const PATIENT_OPTIONS: { key: PatientChoice; label: string; icon: IoniconName; desc: string }[] = [
  { key: 'me',      label: 'Me',            icon: 'person',       desc: 'I need assistance'           },
  { key: 'other',   label: 'Someone else',  icon: 'people',       desc: 'Another person needs help'   },
  { key: 'unknown', label: 'Unknown',       icon: 'help-circle',  desc: 'Not sure who needs help'     },
];

const TYPE_LABELS: Record<string, string> = {
  MEDICAL: 'Medical Emergency', ROAD_ACCIDENT: 'Road Traffic Accident',
  FLOOD: 'Flood / Water Emergency', RESCUE: 'Search & Rescue',
  FIRE: 'Fire Emergency', INDUSTRIAL: 'Industrial Hazard',
  DEBRIS: 'Debris / Structural', OTHER: 'Other Emergency',
};

const TYPE_ICONS: Record<string, IoniconName> = {
  MEDICAL: 'pulse', ROAD_ACCIDENT: 'car-sport', FLOOD: 'water',
  RESCUE: 'hand-left', FIRE: 'flame', INDUSTRIAL: 'warning',
  DEBRIS: 'layers', OTHER: 'alert-circle',
};

const TYPE_COLORS: Record<string, string> = {
  MEDICAL: '#DC2626', ROAD_ACCIDENT: '#EA580C', FLOOD: '#2563EB',
  RESCUE: '#7C3AED', FIRE: '#EA580C', INDUSTRIAL: '#D97706',
  DEBRIS: '#6B7280', OTHER: '#0D6053',
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:          '#F4F6F9',
  white:       '#FFFFFF',
  navy:        '#1A2B4A',
  primary:     '#0D6053',
  primarySoft: '#EEF7F4',
  text:        '#1A2B4A',
  textMid:     '#374151',
  textSub:     '#6B7280',
  border:      '#E5E7EB',
  green:       '#16A34A',
  greenSoft:   '#DCFCE7',
  red:         '#DC2626',
  redSoft:     '#FEF2F2',
  amber:       '#D97706',
  amberSoft:   '#FFFBEB',
};

const SHADOW = {
  shadowColor: '#1A2B4A',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
  elevation: 3,
};

// ─── Main screen ──────────────────────────────────────────────────────────────

/**
 * MOD-09 / MOD-11 / MOD-14 — Step 4 of 4.
 * Collects optional context: photo, GPS, affected count, type-specific hazard
 * prompts, response needs, description, and patient identity. Nothing here blocks
 * submission — every field is optional (Architectural Rule #5).
 */
export default function IncidentDetailsScreen() {
  const router      = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const {
    draft,
    setDescription,
    setPatient,
    setLocation,
    setAffectedCount,
    setHazards,
    setResponseNeeds,
    setManualAddress,
  } = useIncidentStore();

  const [description,       setDescriptionText]   = useState(draft.description ?? '');
  const [patient,           setPatientChoice]      = useState<PatientChoice | null>(null);
  const [gps,               setGps]                = useState<GpsState>('locating');
  const [gpsAccuracy,       setGpsAccuracy]        = useState<number | null>(null);
  const [reverseAddress,    setReverseAddress]     = useState<string | null>(null);
  const [affectedCount,     setAffectedCountLocal] = useState<string | null>(null);
  const [quickAnswers,      setQuickAnswers]       = useState<Record<string, string>>({});
  const [responseNeedsLocal,setResponseNeedsLocal] = useState<string[]>([]);
  const [manualAddressText, setManualAddressText]  = useState('');

  const photoUri = draft.photoUris?.[0];
  const prompts  = draft.type ? (QUICK_PROMPTS[draft.type] ?? []) : [];
  const typeColor = draft.type ? (TYPE_COLORS[draft.type] ?? C.primary) : C.primary;
  const typeIcon  = draft.type ? (TYPE_ICONS[draft.type]  ?? 'alert-circle') : 'alert-circle';
  const typeLabel = draft.type ? (TYPE_LABELS[draft.type] ?? draft.type) : 'Emergency';

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
    setLocation({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy ?? undefined });
    setGpsAccuracy(coords.accuracy ?? null);
    setGps('ready');
    // Route geocoding through the backend (MOD-12) — keeps vendor abstraction consistent.
    void resolveAddress(coords.latitude, coords.longitude);
  }

  async function resolveAddress(lat: number, lng: number) {
    try {
      const result = await reverseGeocode(lat, lng, accessToken ?? undefined);
      if (result.formatted_address) setReverseAddress(result.formatted_address);
    } catch { /* non-critical — GPS coords are already persisted */ }
  }

  function toggleQuickAnswer(promptKey: string, value: string) {
    setQuickAnswers((prev) => {
      if (prev[promptKey] === value) {
        const next = { ...prev };
        delete next[promptKey];
        return next;
      }
      return { ...prev, [promptKey]: value };
    });
  }

  function toggleResponseNeed(key: string) {
    setResponseNeedsLocal((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function submit() {
    if (description.trim()) setDescription(description.trim());
    if (patient) setPatient({ isReporter: patient === 'me', isUnknown: patient === 'unknown' });
    if (affectedCount) setAffectedCount(affectedCount);
    const hazardList = buildHazards(quickAnswers);
    if (hazardList.length) setHazards(hazardList);
    if (responseNeedsLocal.length) setResponseNeeds(responseNeedsLocal);
    if (gps === 'unavailable' && manualAddressText.trim()) setManualAddress(manualAddressText.trim());
    router.push('/emergency/transmission');
  }

  // ── GPS state helpers ──────────────────────────────────────────────────────

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
            <Ionicons name="chevron-back" size={20} color={C.navy} />
          </TouchableOpacity>

          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Text style={styles.brandIconText}>A</Text>
            </View>
            <View>
              <Text style={styles.brandName}>AGAP</Text>
              <Text style={styles.brandTagline}>Incident Management Platform</Text>
            </View>
          </View>

          {/* Step indicator */}
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>4 / 4</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: '100%' }]} />
        </View>

        {/* Page title row */}
        <View style={styles.pageTitleRow}>
          <View>
            <Text style={styles.pageTitle}>Incident Details</Text>
            <Text style={styles.pageSubtitle}>All fields are optional — send the alert now if needed.</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Incident type context card ─────────────────────────────────── */}
        <View style={[styles.typeContextCard, { borderLeftColor: typeColor }]}>
          <View style={[styles.typeIconCircle, { backgroundColor: `${typeColor}15` }]}>
            <Ionicons name={typeIcon} size={20} color={typeColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.typeContextLabel}>Reporting</Text>
            <Text style={styles.typeContextValue}>{typeLabel}</Text>
          </View>
          <View style={[styles.urgencyBadge, { backgroundColor: `${typeColor}15` }]}>
            <View style={[styles.urgencyDot, { backgroundColor: typeColor }]} />
            <Text style={[styles.urgencyText, { color: typeColor }]}>Active</Text>
          </View>
        </View>

        {/* ── Photo card ────────────────────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="camera-outline" size={15} color={C.primary} />
            </View>
            <Text style={styles.sectionTitle}>Incident Photo</Text>
            <Text style={styles.optionalTag}>optional</Text>
          </View>

          <View style={styles.photoContainer}>
            {photoUri ? (
              <>
                <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
                <View style={styles.photoOverlay}>
                  <TouchableOpacity
                    style={styles.photoOverlayBtn}
                    onPress={() => router.replace('/emergency/capture?retake=1')}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="refresh" size={14} color={C.white} style={{ marginRight: 5 }} />
                    <Text style={styles.photoOverlayText}>Retake</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={styles.photoEmpty}
                onPress={() => router.replace('/emergency/capture?retake=1')}
                activeOpacity={0.8}
              >
                <View style={styles.photoEmptyIcon}>
                  <Ionicons name="camera" size={24} color={C.primary} />
                </View>
                <Text style={styles.photoEmptyTitle}>Add a photo</Text>
                <Text style={styles.photoEmptyDesc}>Helps responders assess the scene faster</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── GPS status card ───────────────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="location-outline" size={15} color={C.primary} />
            </View>
            <Text style={styles.sectionTitle}>Location</Text>
            {gpsReady && (
              <View style={styles.confirmedBadge}>
                <Ionicons name="checkmark-circle" size={12} color={C.green} style={{ marginRight: 3 }} />
                <Text style={styles.confirmedText}>Captured</Text>
              </View>
            )}
          </View>

          <View style={[
            styles.gpsRow,
            gpsReady       && styles.gpsRowOk,
            gpsUnavailable && styles.gpsRowWarn,
            gpsLocating    && styles.gpsRowLocating,
          ]}>
            {gpsLocating ? (
              <ActivityIndicator size="small" color={C.primary} style={{ marginRight: 10 }} />
            ) : (
              <Ionicons
                name={gpsReady ? 'location' : 'location-outline'}
                size={18}
                color={gpsReady ? C.green : gpsUnavailable ? C.red : C.amber}
                style={{ marginRight: 10 }}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[
                styles.gpsTitle,
                { color: gpsReady ? C.green : gpsUnavailable ? C.red : C.navy },
              ]}>
                {gpsLocating    ? 'Getting your location…'
                 : gpsReady     ? `Location captured${gpsAccuracy != null ? ` (±${Math.round(gpsAccuracy)} m)` : ''}`
                 :                'GPS unavailable — report still accepted'}
              </Text>
              {reverseAddress && (
                <Text style={styles.gpsAddress} numberOfLines={2}>{reverseAddress}</Text>
              )}
            </View>
          </View>

          {/* Manual address fallback */}
          {gpsUnavailable && (
            <View style={styles.manualAddressWrap}>
              <Text style={styles.manualAddressLabel}>
                Nearest landmark or street
                <Text style={styles.optionalInline}> (helps dispatch find you)</Text>
              </Text>
              <TextInput
                style={styles.manualInput}
                placeholder="e.g. Near Bocaue Market, MacArthur Hwy"
                placeholderTextColor="#9CA3AF"
                value={manualAddressText}
                onChangeText={setManualAddressText}
                returnKeyType="done"
              />
            </View>
          )}
        </View>

        {/* ── Affected count ────────────────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="people-outline" size={15} color={C.primary} />
            </View>
            <Text style={styles.sectionTitle}>People Affected</Text>
            <Text style={styles.optionalTag}>optional</Text>
          </View>

          <View style={styles.chipGrid}>
            {AFFECTED_OPTIONS.map((opt) => {
              const active = affectedCount === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chipCard, active && styles.chipCardActive]}
                  activeOpacity={0.8}
                  onPress={() => setAffectedCountLocal(active ? null : opt.key)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={active ? C.primary : C.textSub}
                    style={{ marginBottom: 4 }}
                  />
                  <Text style={[styles.chipCardText, active && styles.chipCardTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Type-specific quick prompts ───────────────────────────────────── */}
        {prompts.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="clipboard-outline" size={15} color={C.primary} />
              </View>
              <Text style={styles.sectionTitle}>Quick Situation Info</Text>
              <Text style={styles.optionalTag}>helps dispatch prepare</Text>
            </View>

            {prompts.map((prompt, pi) => (
              <View key={prompt.key} style={[styles.promptBlock, pi < prompts.length - 1 && styles.promptBorder]}>
                <Text style={styles.promptQuestion}>{prompt.question}</Text>
                <View style={styles.pillRow}>
                  {prompt.options.map((opt) => {
                    const active = quickAnswers[prompt.key] === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.pill, active && styles.pillActive]}
                        activeOpacity={0.8}
                        onPress={() => toggleQuickAnswer(prompt.key, opt.value)}
                      >
                        {active && (
                          <Ionicons name="checkmark" size={12} color={C.primary} style={{ marginRight: 4 }} />
                        )}
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Response needs ────────────────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="medkit-outline" size={15} color={C.primary} />
            </View>
            <Text style={styles.sectionTitle}>Help Needed</Text>
            <Text style={styles.optionalTag}>optional</Text>
          </View>

          <View style={styles.responseGrid}>
            {RESPONSE_NEEDS.map((need) => {
              const active = responseNeedsLocal.includes(need.key);
              return (
                <TouchableOpacity
                  key={need.key}
                  style={[
                    styles.responseCard,
                    active && { borderColor: need.color, backgroundColor: `${need.color}08` },
                  ]}
                  activeOpacity={0.8}
                  onPress={() => toggleResponseNeed(need.key)}
                >
                  <View style={[
                    styles.responseIconCircle,
                    { backgroundColor: active ? `${need.color}18` : C.bg },
                  ]}>
                    <Ionicons name={need.icon} size={18} color={active ? need.color : C.textSub} />
                  </View>
                  <Text style={[styles.responseLabel, active && { color: need.color, fontWeight: '700' }]}>
                    {need.label}
                  </Text>
                  {active && (
                    <View style={[styles.responseCheck, { backgroundColor: need.color }]}>
                      <Ionicons name="checkmark" size={10} color={C.white} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Description ───────────────────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="document-text-outline" size={15} color={C.primary} />
            </View>
            <Text style={styles.sectionTitle}>Describe the Situation</Text>
            <Text style={styles.optionalTag}>optional</Text>
          </View>

          <TextInput
            style={styles.textArea}
            placeholder="Landmarks, injuries, hazards, or anything responders should know…"
            placeholderTextColor="#9CA3AF"
            value={description}
            onChangeText={setDescriptionText}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{description.length} / 1000</Text>
        </View>

        {/* ── Who needs help ────────────────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="person-outline" size={15} color={C.primary} />
            </View>
            <Text style={styles.sectionTitle}>Who Needs Help?</Text>
            <Text style={styles.optionalTag}>optional</Text>
          </View>

          <View style={styles.patientList}>
            {PATIENT_OPTIONS.map((p) => {
              const active = patient === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.patientRow, active && styles.patientRowActive]}
                  activeOpacity={0.8}
                  onPress={() => setPatientChoice(active ? null : p.key)}
                >
                  <View style={[
                    styles.patientIconCircle,
                    { backgroundColor: active ? C.primarySoft : C.bg },
                  ]}>
                    <Ionicons name={p.icon} size={18} color={active ? C.primary : C.textSub} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.patientLabel, active && styles.patientLabelActive]}>
                      {p.label}
                    </Text>
                    <Text style={styles.patientDesc}>{p.desc}</Text>
                  </View>
                  <View style={[
                    styles.patientRadio,
                    active && styles.patientRadioActive,
                  ]}>
                    {active && <View style={styles.patientRadioDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Disclaimer ────────────────────────────────────────────────────── */}
        <View style={styles.disclaimerRow}>
          <Ionicons name="information-circle-outline" size={14} color={C.textSub} style={{ marginRight: 6 }} />
          <Text style={styles.disclaimerText}>
            AGAP complements — never replaces — 911 and the MDRRMO hotline.
          </Text>
        </View>

        {/* Bottom padding for fixed footer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Fixed submit footer ──────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.footerInner}>
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
              <Text style={styles.submitSubtitle}>Dispatching to nearest responders</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },

  // ── Header ─────────────────────────────────────────────────────────────────
  safeTop: { backgroundColor: C.white },
  header:  {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: C.white,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: C.navy,
    alignItems: 'center', justifyContent: 'center',
  },
  brandIconText: { color: C.white, fontWeight: '900', fontSize: 15 },
  brandName:     { fontSize: 13, fontWeight: '800', color: C.navy },
  brandTagline:  { fontSize: 9,  color: C.textSub, fontWeight: '500' },
  stepBadge: {
    backgroundColor: C.primarySoft,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: `${C.primary}25`,
  },
  stepBadgeText: { fontSize: 12, fontWeight: '800', color: C.primary },

  // Progress bar
  progressBarTrack: { height: 3, backgroundColor: C.border },
  progressBarFill:  { height: 3, backgroundColor: C.primary, borderRadius: 2 },

  // Page title
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  pageTitle:    { fontSize: 22, fontWeight: '800', color: C.navy },
  pageSubtitle: { fontSize: 12, color: C.textSub, marginTop: 2 },

  // ── Body ───────────────────────────────────────────────────────────────────
  scroll: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 16 },

  // ── Type context card ──────────────────────────────────────────────────────
  typeContextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOW,
  },
  typeIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  typeContextLabel: { fontSize: 11, color: C.textSub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  typeContextValue: { fontSize: 14, fontWeight: '800', color: C.navy },
  urgencyBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20,
  },
  urgencyDot:  { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  urgencyText: { fontSize: 11, fontWeight: '700' },

  // ── Section card ───────────────────────────────────────────────────────────
  sectionCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 12,
    ...SHADOW,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: C.navy },
  optionalTag:  { fontSize: 11, color: C.textSub, fontStyle: 'italic' },

  // ── Photo ──────────────────────────────────────────────────────────────────
  photoContainer: {
    height: 190,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: C.bg,
  },
  photo: { width: '100%', height: '100%' },
  photoOverlay: {
    position: 'absolute',
    bottom: 10, right: 10,
  },
  photoOverlayBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(26,43,74,0.80)',
    borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  photoOverlayText: { color: C.white, fontSize: 12, fontWeight: '700' },
  photoEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed',
    borderRadius: 12,
    gap: 6, padding: 20,
  },
  photoEmptyIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  photoEmptyTitle: { fontSize: 14, fontWeight: '700', color: C.navy },
  photoEmptyDesc:  { fontSize: 12, color: C.textSub, textAlign: 'center' },

  // ── GPS card ───────────────────────────────────────────────────────────────
  gpsRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 12, borderRadius: 12,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
  },
  gpsRowOk:       { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  gpsRowWarn:     { backgroundColor: C.redSoft, borderColor: '#FECACA' },
  gpsRowLocating: { backgroundColor: C.bg,      borderColor: C.border  },
  gpsTitle:       { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  gpsAddress:     { fontSize: 12, color: C.textMid, marginTop: 3, lineHeight: 17 },
  manualAddressWrap: { marginTop: 12 },
  manualAddressLabel: { fontSize: 13, fontWeight: '600', color: C.navy, marginBottom: 8 },
  optionalInline:     { color: C.textSub, fontWeight: '400', fontSize: 12 },
  manualInput: {
    height: 46,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: C.navy,
    backgroundColor: C.white,
  },

  // ── Chip grid (affected count) ─────────────────────────────────────────────
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipCard: {
    flex: 1, minWidth: '22%',
    alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  chipCardActive:     { borderColor: C.primary, backgroundColor: C.primarySoft },
  chipCardText:       { fontSize: 12, fontWeight: '600', color: C.textSub, textAlign: 'center' },
  chipCardTextActive: { color: C.primary, fontWeight: '700' },

  // ── Quick prompts ──────────────────────────────────────────────────────────
  promptBlock:  { paddingVertical: 12 },
  promptBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  promptQuestion:{ fontSize: 13, fontWeight: '700', color: C.navy, marginBottom: 10 },
  pillRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.bg,
  },
  pillActive:     { borderColor: C.primary, backgroundColor: C.primarySoft },
  pillText:       { fontSize: 13, fontWeight: '600', color: C.textSub },
  pillTextActive: { color: C.primary, fontWeight: '700' },

  // ── Response needs ─────────────────────────────────────────────────────────
  responseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  responseCard: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bg,
    position: 'relative',
  },
  responseIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  responseLabel: { fontSize: 13, fontWeight: '600', color: C.textSub, textAlign: 'center' },
  responseCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Description ────────────────────────────────────────────────────────────
  textArea: {
    minHeight: 100,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: C.navy,
    backgroundColor: C.bg,
    lineHeight: 20,
  },
  charCount: { fontSize: 11, color: C.textSub, textAlign: 'right', marginTop: 6 },

  // ── Patient selector ───────────────────────────────────────────────────────
  patientList: { gap: 8 },
  patientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.bg,
  },
  patientRowActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
  patientIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  patientLabel:       { fontSize: 14, fontWeight: '700', color: C.navy },
  patientLabelActive: { color: C.primary },
  patientDesc:        { fontSize: 12, color: C.textSub, marginTop: 1 },
  patientRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  patientRadioActive: { borderColor: C.primary },
  patientRadioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.primary,
  },

  // ── Disclaimer ─────────────────────────────────────────────────────────────
  disclaimerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  disclaimerText: { flex: 1, fontSize: 11, color: C.textSub, lineHeight: 17 },

  // ── Submit footer ──────────────────────────────────────────────────────────
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    paddingHorizontal: 16,
    ...SHADOW,
    shadowOffset: { width: 0, height: -3 },
  },
  footerInner: {},
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.red,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    ...SHADOW,
    shadowColor: C.red,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  submitIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  submitTitle:    { fontSize: 15, fontWeight: '800', color: C.white },
  submitSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

  // ── Shared ─────────────────────────────────────────────────────────────────
  confirmedBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.greenSoft,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20,
  },
  confirmedText: { fontSize: 11, fontWeight: '700', color: C.green },
});
