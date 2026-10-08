import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { IncidentType } from '@agap/shared';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { GuideCard } from '../../src/components/first-aid/GuideCard';
import { getAllGuides } from '../../src/data/first-aid';
import { useTranslations, useFontScale } from '../../src/hooks/useAccessibility';
import { useAccessibilityStore } from '../../src/stores/accessibility.store';

type Filter = 'all' | 'core' | IncidentType.ROAD_ACCIDENT | IncidentType.FIRE | IncidentType.FLOOD;

const EMERGENCY_NUMBER = '911';

/**
 * First Aid Guides hub (offline-first). Lists bundled bilingual guides a
 * citizen can follow while an ambulance/rescuer is on the way. AGAP
 * complements — it never replaces 911/MDRRMO (Architectural Rule 9).
 */
export default function FirstAidScreen() {
  const router = useRouter();
  const t = useTranslations();
  const { fs } = useFontScale();
  const lang = useAccessibilityStore((s) => s.language);

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t.firstAid.filterAll },
    { key: 'core', label: t.firstAid.filterCore },
    { key: IncidentType.ROAD_ACCIDENT, label: t.firstAid.filterRoad },
    { key: IncidentType.FIRE, label: t.firstAid.filterFire },
    { key: IncidentType.FLOOD, label: t.firstAid.filterFlood },
  ];

  const guides = useMemo(() => {
    let list = getAllGuides();
    if (filter === 'core') list = list.filter((g) => g.appliesToAll);
    else if (filter !== 'all') list = list.filter((g) => g.appliesToAll || g.category === filter);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (g) =>
          g.title[lang].toLowerCase().includes(q) ||
          g.summary[lang].toLowerCase().includes(q),
      );
    }
    return list;
  }, [filter, query, lang]);

  function callEmergency() {
    Linking.openURL(`tel:${EMERGENCY_NUMBER}`).catch(() => undefined);
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={t.firstAid.screenTitle} />
      <FlatList
        data={guides}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => (
          <GuideCard guide={item} lang={lang} onPress={() => router.push(`/first-aid/${item.id}`)} />
        )}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={[styles.subtitle, { fontSize: fs(14) }]}>{t.firstAid.subtitle}</Text>

            {/* Emergency-first banner (Rule 9) */}
            <View style={styles.banner}>
              <Ionicons name="call" size={18} color="#DC2626" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerText, { fontSize: fs(13) }]}>{t.firstAid.bannerText}</Text>
                <TouchableOpacity style={styles.callBtn} onPress={callEmergency} activeOpacity={0.85}>
                  <Ionicons name="call" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={[styles.callBtnText, { fontSize: fs(13) }]}>{t.firstAid.callButton}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Offline hint */}
            <View style={styles.offlineRow}>
              <Ionicons name="cloud-offline-outline" size={14} color="#0D6053" style={{ marginRight: 5 }} />
              <Text style={[styles.offlineText, { fontSize: fs(12) }]}>{t.firstAid.offline}</Text>
            </View>

            {/* Search */}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={17} color="#9CA3AF" style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { fontSize: fs(15) }]}
                placeholder={t.firstAid.searchPlaceholder}
                placeholderTextColor="#9CA3AF"
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color="#C4CBD4" />
                </TouchableOpacity>
              )}
            </View>

            {/* Category filters */}
            <View style={styles.chipRow}>
              {filters.map((f) => {
                const active = filter === f.key;
                return (
                  <TouchableOpacity
                    key={String(f.key)}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.8}
                    onPress={() => setFilter(f.key)}
                  >
                    <Text style={[styles.chipText, { fontSize: fs(13) }, active && styles.chipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { fontSize: fs(14) }]}>{t.firstAid.noResults}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  listContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  subtitle: { color: '#6B7280', lineHeight: 21, marginBottom: 16 },

  banner: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 12,
  },
  bannerText: { color: '#991B1B', fontWeight: '600', lineHeight: 19, marginBottom: 10 },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: '#DC2626', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22,
  },
  callBtnText: { color: '#FFFFFF', fontWeight: '700' },

  offlineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  offlineText: { color: '#0D6053', fontWeight: '600' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    height: 48, borderRadius: 14, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', marginBottom: 14,
  },
  searchInput: { flex: 1, color: '#111827', padding: 0 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
  },
  chipActive: { borderColor: '#0D6053', backgroundColor: '#F0F7F4' },
  chipText: { fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#0D6053' },

  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 40 },
});
