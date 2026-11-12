import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  getAnnouncementArchive,
  type Announcement,
} from '@/src/services/api/announcements.api';
import {
  PAST_NOTICE_LABELS,
  categoryLabel,
  pastNoticeState,
} from './announcement-labels';

const TEAL = '#0D6053';

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function PastNoticeCard({ announcement, onPress }: { announcement: Announcement; onPress: () => void }) {
  const state = pastNoticeState(announcement);
  const stateLabel = state ? PAST_NOTICE_LABELS[state] : 'Past notice';
  const category = categoryLabel(announcement.category);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${announcement.title}. ${category}. ${stateLabel}. Published ${formatDate(announcement.published_at)}`}
    >
      <View style={styles.cardIcon}>
        <Ionicons name="megaphone-outline" size={19} color={TEAL} />
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardMeta}>
          <Text style={styles.stateLabel} numberOfLines={1}>
            {stateLabel} · {category}
          </Text>
          <Text style={styles.date}>{formatDate(announcement.published_at)}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{announcement.title}</Text>
        {!!(announcement.summary ?? announcement.body) && (
          <Text style={styles.cardSummary} numberOfLines={2}>
            {announcement.summary ?? announcement.body}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9AA8B6" />
    </TouchableOpacity>
  );
}

/**
 * Announcements that were published and have since ended (withdrawn, replaced
 * or archived), with search and a category filter (MOD-53 "archive with search
 * and filter"). Read-only: residents look back at notices; they never archive.
 */
export function PastAnnouncementsList({ bottomPadding = 120 }: { bottomPadding?: number }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const {
    data: announcements = [],
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useQuery<Announcement[]>({
    queryKey: ['announcement-archive'],
    queryFn: getAnnouncementArchive,
    staleTime: 60_000,
  });

  // Only offer categories that have past notices, so no filter leads to an empty list.
  const categories = useMemo(
    () => [...new Set(announcements.map((a) => a.category))].sort((a, b) =>
      categoryLabel(a).localeCompare(categoryLabel(b)),
    ),
    [announcements],
  );

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () => announcements.filter((a) => {
      if (category && a.category !== category) return false;
      if (!query) return true;
      return [a.title, a.summary, a.body].some((text) => text?.toLowerCase().includes(query));
    }),
    [announcements, category, query],
  );
  const filtering = !!query || !!category;

  if (isLoading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={TEAL} size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.state}>
        <View style={[styles.emptyIcon, styles.emptyIconMuted]}>
          <Ionicons name="cloud-offline-outline" size={30} color="#8795A3" />
        </View>
        <Text style={styles.emptyTitle}>Could not load past announcements</Text>
        <Text style={styles.emptySubtitle}>Check your connection and try again.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => void refetch()} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        announcements.length > 0 ? (
          <View style={styles.controls}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color="#8795A3" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search past announcements"
                placeholderTextColor="#9AA8B6"
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel="Search past announcements"
              />
              {search ? (
                <TouchableOpacity
                  onPress={() => setSearch('')}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close-circle" size={18} color="#9AA8B6" />
                </TouchableOpacity>
              ) : null}
            </View>
            {categories.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                keyboardShouldPersistTaps="handled"
              >
                {['', ...categories].map((value) => {
                  const active = category === value;
                  const label = value ? categoryLabel(value) : 'All';
                  return (
                    <TouchableOpacity
                      key={value || 'all'}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setCategory(value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Filter: ${label}`}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <PastNoticeCard
          announcement={item}
          onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: item.id } } as never)}
        />
      )}
      contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={TEAL}
          colors={[TEAL]}
        />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name={filtering ? 'search-outline' : 'time-outline'} size={30} color={TEAL} />
          </View>
          <Text style={styles.emptyTitle}>
            {filtering ? 'No matching announcements' : 'No past announcements'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {filtering
              ? 'Try another search or category.'
              : 'Announcements that were withdrawn, replaced or have ended will appear here.'}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 4, flexGrow: 1 },
  controls: { marginBottom: 12, gap: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(168,181,193,0.35)',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1D2B3A', paddingVertical: 10 },
  chips: { gap: 8, paddingRight: 4 },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(168,181,193,0.35)',
  },
  chipActive: { backgroundColor: TEAL, borderColor: TEAL },
  chipText: { fontSize: 12, fontWeight: '700', color: '#4A5A6A' },
  chipTextActive: { color: '#FFFFFF' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(168,181,193,0.22)',
    shadowColor: '#8795A3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF7F4',
  },
  cardContent: { flex: 1, minWidth: 0 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 5 },
  stateLabel: { flexShrink: 1, fontSize: 10, fontWeight: '800', color: '#637589', textTransform: 'uppercase' },
  date: { fontSize: 10, color: '#9AA8B6' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1D2B3A', lineHeight: 20 },
  cardSummary: { marginTop: 4, fontSize: 12, color: '#718096', lineHeight: 17 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 36 },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: '#E6F4F1',
  },
  emptyIconMuted: { backgroundColor: '#EEF1F4' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1D2B3A', textAlign: 'center' },
  emptySubtitle: { marginTop: 5, fontSize: 13, color: '#718096', textAlign: 'center', lineHeight: 19 },
  retryButton: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12, backgroundColor: TEAL },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
