import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getNearbyHospitals,
  listHospitals,
  type FacilityReceivingStatus,
  type NearbyHospital,
  type TransportHospital,
} from '@/src/services/api/transport.api';
import { buildDestinationList, formatDistance, type DestinationOption } from '@/src/lib/transport-target';
import { useTranslations } from '@/src/hooks/useAccessibility';
import { colors, radius } from '@/src/theme/tokens';

const RECEIVING_TONE: Record<FacilityReceivingStatus, { bg: string; fg: string }> = {
  OPEN: { bg: colors.primarySoft, fg: colors.primary },
  EMERGENCY_ONLY: { bg: colors.amberSoft, fg: colors.amber },
  AT_CAPACITY: { bg: colors.dangerSoft, fg: colors.danger },
  CLOSED: { bg: colors.dangerSoft, fg: colors.danger },
  UNKNOWN: { bg: colors.surface, fg: colors.textSub },
};

/**
 * Destination hospital picker (MOD-39/40, plan §15). Nearest VERIFIED hospitals first,
 * sorted by the server from the responder's last fix with a straight-line distance;
 * then the remaining selectable hospitals alphabetically (or all of them when there
 * is no fix or /hospitals/nearby fails). Each row shows its receiving status and,
 * when unverified, "Location not verified". "Decide later" keeps the transport open
 * without a destination.
 */
export function DestinationPicker({
  visible, token, position, saveError, onSelect, onClose,
}: {
  visible: boolean;
  token: string;
  position: { lat: number; lng: number } | null;
  /** Why the last choice was not saved; the sheet stays open so the crew can retry. */
  saveError?: string | null;
  onSelect: (hospitalId?: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations().transport;
  const [all, setAll] = useState<TransportHospital[]>([]);
  const [nearby, setNearby] = useState<NearbyHospital[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The fix when the sheet opened; a moving unit must not reshuffle the list under a finger.
  const lat = position?.lat;
  const lng = position?.lng;
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.allSettled([
      listHospitals(token),
      lat != null && lng != null ? getNearbyHospitals(lat, lng, token) : Promise.resolve([]),
    ]).then(([allResult, nearbyResult]) => {
      if (cancelled) return;
      setAll(allResult.status === 'fulfilled' ? allResult.value : []);
      setNearby(nearbyResult.status === 'fulfilled' ? nearbyResult.value : []);
      if (allResult.status === 'rejected' && nearbyResult.status === 'rejected') {
        const reason = allResult.reason;
        setError(reason instanceof Error && reason.message ? reason.message : t.picker.loadError);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Reload when the sheet opens, not on every GPS fix while it is open.
  }, [token, visible]);

  const options = useMemo(() => {
    const query = search.trim().toLowerCase();
    return buildDestinationList(nearby, all).filter((hospital) => hospital.name.toLowerCase().includes(query));
  }, [all, nearby, search]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t.picker.title}</Text>
          <Text style={styles.subtitle}>{t.picker.subtitle}</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.picker.search}
            placeholderTextColor={colors.textSub}
            style={styles.search}
            accessibilityLabel={t.picker.search}
          />
          <Pressable style={styles.later} onPress={() => onSelect()} accessibilityRole="button">
            <Ionicons name="time-outline" size={21} color={colors.primary} />
            <Text style={styles.laterText}>{t.picker.decideLater}</Text>
          </Pressable>
          {saveError ? (
            <Text style={styles.error} accessibilityRole="alert">{t.picker.saveError(saveError)}</Text>
          ) : null}
          {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <FlatList
            data={options}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <HospitalRow item={item} onPress={() => onSelect(item.id)} />}
            ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>{t.picker.empty}</Text> : null}
          />
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function HospitalRow({ item, onPress }: { item: DestinationOption; onPress: () => void }) {
  const t = useTranslations().transport;
  const receiving = RECEIVING_TONE[item.receiving_status] ? item.receiving_status : 'UNKNOWN';
  const tone = RECEIVING_TONE[receiving];
  return (
    <Pressable style={styles.item} onPress={onPress} accessibilityRole="button" accessibilityLabel={item.name}>
      <Ionicons name="medical-outline" size={21} color={colors.primary} />
      <View style={styles.itemText}>
        <Text style={styles.name}>{item.name}</Text>
        {!!item.address && <Text style={styles.address}>{item.address}</Text>}
        <View style={styles.badges}>
          {item.distanceMeters != null && (
            <Text style={styles.distance}>{t.picker.straightLine(formatDistance(item.distanceMeters))}</Text>
          )}
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{t.picker.receiving[receiving]}</Text>
          </View>
          {item.location_status !== 'VERIFIED' && (
            <View style={[styles.badge, { backgroundColor: colors.amberSoft }]}>
              <Text style={[styles.badgeText, { color: colors.amber }]}>{t.picker.notVerified}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '82%', backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: colors.textSub, marginTop: 4, marginBottom: 14 },
  search: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, color: colors.text, borderWidth: 1, borderColor: colors.border },
  later: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border },
  laterText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  loading: { margin: 18 },
  error: { color: colors.danger, paddingVertical: 12 },
  empty: { color: colors.textSub, textAlign: 'center', padding: 20 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemText: { flex: 1 },
  name: { color: colors.text, fontWeight: '700' },
  address: { color: colors.textSub, marginTop: 3, fontSize: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  distance: { color: colors.textMid, fontSize: 12, fontWeight: '600' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: colors.textSub, fontWeight: '700' },
});
