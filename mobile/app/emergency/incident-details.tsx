import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { IncidentType } from '@agap/shared';
import { useIncidentStore } from '@/src/stores/incident.store';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type PatientChoice = 'me' | 'other' | 'unknown';
type GpsState = 'locating' | 'ready' | 'unavailable';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAP_API_KEY ?? '';

// ── Type-specific quick prompts (MOD-09) ──────────────────────────────────────

type PromptOption = { value: string; label: string };
type PromptDef = { key: string; question: string; options: PromptOption[] };

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
        { value: 'knee', label: 'Knee' },
        { value: 'waist', label: 'Waist' },
        { value: 'above', label: 'Above waist' },
      ],
    },
  ],
};

// Human-readable hazard strings shown to the dispatcher
const HAZARD_LABELS: Record<string, Record<string, string>> = {
  injuries: { yes: 'Injuries reported visible', no: 'No visible injuries' },
  road_blocked: { yes: 'Road is blocked', no: 'Road passable' },
  trapped: { yes: 'Person(s) may be trapped', unknown: 'Possible entrapment — unconfirmed' },
  gas: { yes: 'Gas/chemicals may be involved', unknown: 'Possible gas/chemicals — unconfirmed' },
  stranded: { yes: 'People are stranded' },
  water_level: {
    ankle: 'Water level: ankle-deep',
    knee: 'Water level: knee-deep',
    waist: 'Water level: waist-deep',
    above: 'Water level: above waist',
  },
};

function buildHazards(answers: Record<string, string>): string[] {
  return Object.entries(answers)
    .map(([k, v]) => HAZARD_LABELS[k]?.[v])
    .filter((x): x is string => Boolean(x));
}

// ── Static option lists ───────────────────────────────────────────────────────

const RESPONSE_NEEDS: { key: string; label: string; icon: IconName }[] = [
  { key: 'ambulance', label: 'Ambulance', icon: 'medkit' },
  { key: 'fire_truck', label: 'Fire Truck', icon: 'flame' },
  { key: 'rescue_boat', label: 'Rescue Boat', icon: 'boat' },
  { key: 'police', label: 'Police', icon: 'shield-checkmark' },
];

const AFFECTED_OPTIONS: { key: string; label: string }[] = [
  { key: '1', label: '1 person' },
  { key: '2-5', label: '2–5 people' },
  { key: '5+', label: '5+ people' },
  { key: 'unknown', label: 'Unknown' },
];

const PATIENT_OPTIONS: { key: PatientChoice; label: string; icon: IconName }[] = [
  { key: 'me', label: 'Me', icon: 'person' },
  { key: 'other', label: 'Someone else', icon: 'people' },
  { key: 'unknown', label: 'Unknown', icon: 'help-circle' },
];

// ── Screen ────────────────────────────────────────────────────────────────────

/**
 * MOD-09 / MOD-11 / MOD-14 — Step 4 of 4.
 * Collects optional details: affected count, type-specific hazard prompts,
 * response needs, GPS (with Mapbox reverse geocode), description, and patient.
 * Nothing here blocks submission (Architectural Rule #5).
 */
export default function IncidentDetailsScreen() {
  const router = useRouter();
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

  const [description, setDescriptionText] = useState(draft.description ?? '');
  const [patient, setPatientChoice] = useState<PatientChoice | null>(null);
  const [gps, setGps] = useState<GpsState>('locating');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [reverseAddress, setReverseAddress] = useState<string | null>(null);
  const [affectedCount, setAffectedCountLocal] = useState<string | null>(null);
  const [quickAnswers, setQuickAnswers] = useState<Record<string, string>>({});
  const [responseNeedsLocal, setResponseNeedsLocal] = useState<string[]>([]);
  const [manualAddressText, setManualAddressText] = useState('');

  const photoUri = draft.photoUris?.[0];
  const prompts = draft.type ? (QUICK_PROMPTS[draft.type] ?? []) : [];

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
        if (last) {
          applyCoords(last.coords);
        } else {
          setGps('unavailable');
        }
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
    void reverseGeocode(coords.longitude, coords.latitude);
  }

  async function reverseGeocode(lng: number, lat: number) {
    if (!MAPBOX_TOKEN) return;
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address,place&limit=1&access_token=${MAPBOX_TOKEN}`,
      );
      const data = await res.json() as { features?: { place_name: string }[] };
      const name = data.features?.[0]?.place_name ?? null;
      if (name) setReverseAddress(name);
    } catch { /* non-critical — GPS coords still captured */ }
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

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/icons/agap-solo-icon.png')}
            style={styles.logoMark}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.logoName}>AGAP</Text>
            <Text style={styles.logoTagline}>Incident Management Platform</Text>
          </View>
        </View>
        <View style={styles.stepsRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.stepDot, i === 3 && styles.stepDotActive]} />
          ))}
        </View>
        <Text style={styles.stepLabel}>Step 4 of 4 — Incident Details</Text>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Add more{'\n'}details</Text>
        <Text style={styles.subtitle}>All fields are optional — send the alert right now if needed.</Text>

        {/* ── Photo ── */}
        <View style={styles.photoCard}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <Ionicons name="image-outline" size={28} color="#9CA3AF" />
              <Text style={styles.photoEmptyText}>No photo attached</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.retakeBtn}
            onPress={() => router.replace('/emergency/capture?retake=1')}
            activeOpacity={0.8}
          >
            <Ionicons name="camera-outline" size={15} color="#0D6053" style={{ marginRight: 6 }} />
            <Text style={styles.retakeText}>{photoUri ? 'Retake photo' : 'Add photo'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── GPS status ── */}
        <View style={[styles.gpsCard, gps === 'unavailable' ? styles.gpsCardWarn : styles.gpsCardOk]}>
          <Ionicons
            name={gps === 'ready' ? 'location' : gps === 'locating' ? 'locate' : 'location-outline'}
            size={16}
            color={gps === 'unavailable' ? '#EF4444' : '#0D6053'}
            style={{ marginRight: 8, marginTop: 1 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.gpsTitle, { color: gps === 'unavailable' ? '#EF4444' : '#0D6053' }]}>
              {gps === 'ready'
                ? `Location captured${gpsAccuracy != null ? ` (±${Math.round(gpsAccuracy)}m)` : ''}`
                : gps === 'locating'
                ? 'Getting your location…'
                : 'GPS unavailable — report still accepted'}
            </Text>
            {reverseAddress != null && (
              <Text style={styles.gpsAddress} numberOfLines={2}>{reverseAddress}</Text>
            )}
          </View>
        </View>

        {/* ── Manual address fallback (MOD-11) ── */}
        {gps === 'unavailable' && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 4 }]}>
              Nearest landmark or street <Text style={styles.optional}>(helps dispatch find you)</Text>
            </Text>
            <TextInput
              style={styles.addressInput}
              placeholder="e.g. Near Bocaue Market, MacArthur Hwy"
              placeholderTextColor="#9CA3AF"
              value={manualAddressText}
              onChangeText={setManualAddressText}
              returnKeyType="done"
            />
          </>
        )}

        {/* ── Affected count (MOD-09) ── */}
        <Text style={styles.sectionLabel}>
          How many people are affected? <Text style={styles.optional}>(optional)</Text>
        </Text>
        <View style={styles.chipRow}>
          {AFFECTED_OPTIONS.map((opt) => {
            const active = affectedCount === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.8}
                onPress={() => setAffectedCountLocal(active ? null : opt.key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Type-specific quick prompts (MOD-09) ── */}
        {prompts.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>
              Quick info <Text style={styles.optional}>(helps dispatch prepare)</Text>
            </Text>
            {prompts.map((prompt) => (
              <View key={prompt.key} style={styles.promptBlock}>
                <Text style={styles.promptQuestion}>{prompt.question}</Text>
                <View style={styles.chipRow}>
                  {prompt.options.map((opt) => {
                    const active = quickAnswers[prompt.key] === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.chip, active && styles.chipActive]}
                        activeOpacity={0.8}
                        onPress={() => toggleQuickAnswer(prompt.key, opt.value)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Response needed (MOD-09 / MOD-14) ── */}
        <Text style={styles.sectionLabel}>
          What kind of help is needed? <Text style={styles.optional}>(optional)</Text>
        </Text>
        <View style={styles.chipRow}>
          {RESPONSE_NEEDS.map((need) => {
            const active = responseNeedsLocal.includes(need.key);
            return (
              <TouchableOpacity
                key={need.key}
                style={[styles.chip, styles.chipWithIcon, active && styles.chipActive]}
                activeOpacity={0.8}
                onPress={() => toggleResponseNeed(need.key)}
              >
                <Ionicons
                  name={need.icon}
                  size={13}
                  color={active ? '#0D6053' : '#6B7280'}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{need.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Free-text description ── */}
        <Text style={styles.sectionLabel}>
          Describe the situation <Text style={styles.optional}>(optional)</Text>
        </Text>
        <TextInput
          style={styles.textArea}
          placeholder="Additional details — landmarks, injuries, hazards…"
          placeholderTextColor="#9CA3AF"
          value={description}
          onChangeText={setDescriptionText}
          multiline
          maxLength={1000}
          textAlignVertical="top"
        />

        {/* ── Who needs help ── */}
        <Text style={styles.sectionLabel}>
          Who needs help? <Text style={styles.optional}>(optional)</Text>
        </Text>
        <View style={styles.patientRow}>
          {PATIENT_OPTIONS.map((p) => {
            const active = patient === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                style={[styles.patientPill, active && styles.patientPillActive]}
                activeOpacity={0.8}
                onPress={() => setPatientChoice(active ? null : p.key)}
              >
                <Ionicons
                  name={p.icon}
                  size={15}
                  color={active ? '#0D6053' : '#6B7280'}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.patientText, active && styles.patientTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.disclaimer}>
          AGAP complements — it never replaces 911 & the MDRRMO hotline.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.submitBtn} onPress={submit} activeOpacity={0.85}>
          <Ionicons name="send" size={17} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.submitText}>Send Emergency Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  safeTop: { backgroundColor: '#FFFFFF', alignItems: 'center', paddingBottom: 4 },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 16 },
  logoMark: { width: 44, height: 44 },
  logoName: { fontSize: 20, fontWeight: '900', color: '#0D6053', letterSpacing: 0.5 },
  logoTagline: { fontSize: 10, color: '#6B7280', fontWeight: '500' },

  stepsRow: { flexDirection: 'row', gap: 6, marginBottom: 5 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  stepDotActive: { width: 24, borderRadius: 4, backgroundColor: '#0D6053' },
  stepLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', letterSpacing: 0.3 },

  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  title: { fontSize: 34, fontWeight: '800', color: '#0D6053', lineHeight: 40, marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6B7280', lineHeight: 22, marginBottom: 24 },

  // Photo
  photoCard: { alignItems: 'center', marginBottom: 16 },
  photo: { width: '100%', height: 180, borderRadius: 16, backgroundColor: '#F4F5F7' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  photoEmptyText: { marginTop: 8, fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#F0F7F4' },
  retakeText: { fontSize: 13, fontWeight: '700', color: '#0D6053' },

  // GPS
  gpsCard: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, marginBottom: 20 },
  gpsCardOk: { backgroundColor: '#F0F7F4' },
  gpsCardWarn: { backgroundColor: '#FEF2F2' },
  gpsTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  gpsAddress: { fontSize: 12, color: '#374151', marginTop: 3, lineHeight: 17 },

  // Section labels
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  optional: { color: '#9CA3AF', fontWeight: '500', fontSize: 13 },

  // Chips (affected count, quick prompts, response needs)
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  chipActive: { borderColor: '#0D6053', backgroundColor: '#F0F7F4' },
  chipWithIcon: { flexDirection: 'row', alignItems: 'center' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#0D6053' },

  // Quick prompts
  promptBlock: { marginBottom: 16 },
  promptQuestion: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },

  // Manual address input
  addressInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    marginBottom: 22,
    backgroundColor: '#FFFFFF',
  },

  // Free-text description
  textArea: {
    minHeight: 96,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: '#111827',
    marginBottom: 22,
    backgroundColor: '#FFFFFF',
  },

  // Patient pills
  patientRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  patientPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  patientPillActive: { borderColor: '#0D6053', backgroundColor: '#F0F7F4' },
  patientText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  patientTextActive: { color: '#0D6053' },

  disclaimer: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 17 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  submitBtn: { height: 56, borderRadius: 28, backgroundColor: '#DC2626', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
});
