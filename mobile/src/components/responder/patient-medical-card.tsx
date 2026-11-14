import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFontScale, useTranslations } from '@/src/hooks/useAccessibility';
import { ApiError } from '@/src/services/api/http';
import { getPatientMedicalProfile, type PatientMedicalProfile } from '@/src/services/api/responders.api';
import { colors, radius } from '@/src/theme/tokens';

/**
 * MOD-03 / MOD-32 / MOD-48: the patient's own medical profile for the accepted crew.
 * Shown only when the reporter said they themselves need help and consented (the
 * server decides; reporter ≠ patient otherwise). Closed until the crew taps Show,
 * because every read is logged for the patient; Hide drops it from memory.
 */
export function PatientMedicalCard({ dispatchId, token }: { dispatchId: string; token: string }) {
  const t = useTranslations().patientMedical;
  const { fs } = useFontScale();
  const [profile, setProfile] = useState<PatientMedicalProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setProfile(await getPatientMedicalProfile(dispatchId, token));
    } catch (err) {
      // 404: consent withdrawn or the incident ended since the screen loaded.
      setError(err instanceof ApiError && (err.status === 404 || err.status === 403) ? t.unavailable : t.failed);
    } finally {
      setLoading(false);
    }
  }

  const list = (items: string[]) => (items.length ? items.join(', ') : t.none);
  const updated = profile?.last_reviewed_at ?? profile?.updated_at ?? null;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.titleRow}>
        <Ionicons name="medkit-outline" size={16} color={colors.dangerStrong} />
        <Text style={[styles.title, { fontSize: fs(15) }]}>{t.title}</Text>
      </View>
      <Text style={[styles.note, { fontSize: fs(12) }]}>{t.sharedNote}</Text>

      {profile ? (
        <View style={styles.body}>
          {profile.allergies.length > 0 && (
            <View style={styles.alert} accessibilityLabel={`${t.allergies}: ${list(profile.allergies)}`}>
              <Ionicons name="warning-outline" size={16} color={colors.dangerStrong} />
              <Text style={[styles.alertText, { fontSize: fs(14) }]}>
                {t.allergies}: {list(profile.allergies)}
              </Text>
            </View>
          )}
          <Row label={t.bloodType} value={profile.blood_type ?? t.unknown} fs={fs} />
          {profile.allergies.length === 0 && <Row label={t.allergies} value={t.none} fs={fs} />}
          <Row label={t.conditions} value={list(profile.medical_conditions)} fs={fs} />
          <Row label={t.medications} value={list(profile.current_medications)} fs={fs} />
          <Row label={t.disabilities} value={list(profile.disabilities)} fs={fs} />
          {profile.responder_notes ? <Row label={t.notes} value={profile.responder_notes} fs={fs} /> : null}
          {updated && (
            <Text style={[styles.meta, { fontSize: fs(12) }]}>
              {t.updated}: {new Date(updated).toLocaleDateString()}
            </Text>
          )}
          <Text style={[styles.meta, { fontSize: fs(12) }]}>{t.selfReported}</Text>
          <Pressable
            onPress={() => setProfile(null)}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { fontSize: fs(14) }]}>{t.hide}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {error && <Text style={[styles.error, { fontSize: fs(13) }]} accessibilityLiveRegion="polite">{error}</Text>}
          <Pressable
            onPress={() => void show()}
            disabled={loading}
            style={({ pressed }) => [styles.primaryBtn, (pressed || loading) && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ busy: loading }}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={[styles.primaryText, { fontSize: fs(15) }]}>{t.show}</Text>}
          </Pressable>
          <Text style={[styles.meta, { fontSize: fs(12) }]}>{t.logged}</Text>
        </>
      )}
    </View>
  );
}

function Row({ label, value, fs }: { label: string; value: string; fs: (n: number) => number }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { fontSize: fs(12) }]}>{label}</Text>
      <Text style={[styles.rowValue, { fontSize: fs(14) }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    marginTop: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#F3D3D7',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontWeight: '700', color: colors.text },
  note: { color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  body: { marginTop: 10, gap: 8 },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  alertText: { flex: 1, fontWeight: '700', color: colors.dangerStrong, lineHeight: 20 },
  row: { gap: 2 },
  rowLabel: { color: colors.textMuted, fontWeight: '600' },
  rowValue: { color: colors.text, lineHeight: 20 },
  meta: { color: colors.textMuted, marginTop: 6, lineHeight: 17 },
  error: { color: colors.dangerStrong, marginTop: 8, fontWeight: '600' },
  primaryBtn: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.dangerStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.white, fontWeight: '700' },
  secondaryBtn: {
    marginTop: 4,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E3E9EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.textMid, fontWeight: '600' },
  pressed: { opacity: 0.75 },
});
