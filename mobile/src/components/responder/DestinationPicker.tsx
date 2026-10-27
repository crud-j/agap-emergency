import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listHospitals, type TransportHospital } from '@/src/services/api/transport.api';
import { colors, radius } from '@/src/theme/tokens';

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
  const [hospitals, setHospitals] = useState<TransportHospital[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    listHospitals(token)
      .then(setHospitals)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load hospitals.'))
      .finally(() => setLoading(false));
  }, [token, visible]);

  const filtered = useMemo(() => {
    const distance = (hospital: TransportHospital): number | null => {
      if (!position || hospital.latitude == null || hospital.longitude == null) return null;
      const lat = Number(hospital.latitude);
      const lng = Number(hospital.longitude);
      const dLat = (lat - position.lat) * Math.PI / 180;
      const dLng = (lng - position.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(position.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    return hospitals
      .filter((hospital) => hospital.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const aDistance = distance(a);
        const bDistance = distance(b);
        if (aDistance != null && bDistance != null) return aDistance - bDistance;
        if (aDistance != null) return -1;
        if (bDistance != null) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [hospitals, position, search]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Destination hospital</Text>
          <Text style={styles.subtitle}>You can set or change this destination later.</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search hospitals"
            placeholderTextColor={colors.textSub}
            style={styles.search}
            accessibilityLabel="Search hospitals"
          />
          <Pressable style={styles.later} onPress={() => onSelect()} accessibilityRole="button">
            <Ionicons name="time-outline" size={21} color={colors.primary} />
            <Text style={styles.laterText}>Decide later</Text>
          </Pressable>
          {saveError ? (
            <Text style={styles.error} accessibilityRole="alert">
              Destination not saved: {saveError} Choose again to retry.
            </Text>
          ) : null}
          {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.item} onPress={() => onSelect(item.id)}>
                <Ionicons name="medical-outline" size={21} color={colors.primary} />
                <View style={styles.itemText}>
                  <Text style={styles.name}>{item.name}</Text>
                  {!!item.address && <Text style={styles.address}>{item.address}</Text>}
                </View>
              </Pressable>
            )}
            ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>No hospitals found.</Text> : null}
          />
          <Pressable style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
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
  cancel: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: colors.textSub, fontWeight: '700' },
});
