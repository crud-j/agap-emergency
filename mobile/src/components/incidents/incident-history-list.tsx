import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { colors, radius } from '../../theme/tokens';
import { useAuthStore } from '../../stores/auth.store';
import { useTranslations } from '../../hooks/useAccessibility';
import { listMyIncidents, type IncidentSummary } from '../../services/api/incidents.api';
import { SearchInput } from '../ui/search-input';
import { SegmentedFilter } from '../ui/segmented-filter';
import { IncidentHistoryCard } from './incident-history-card';
import { typeMeta, matchesFilter, type HistoryFilter } from './incident-meta';

type SortOrder = 'latest' | 'oldest';

/**
 * Full incident-history body: search, status filter tabs, sort toggle, and the
 * card list — plus loading / empty / error / signed-out states. Owns its own
 * data fetch so it can be dropped into either the pushed history screen or the
 * Incidents tab. Search and filtering run client-side for instant feedback.
 */
export function IncidentHistoryList({
  onOpenIncident,
  ListHeader,
  bottomPadding = 32,
}: {
  onOpenIncident: (id: string) => void;
  ListHeader?: React.ReactElement;
  bottomPadding?: number;
}) {
  const t = useTranslations();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [sort, setSort] = useState<SortOrder>('latest');

  const {
    data: incidents = [],
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useQuery<IncidentSummary[]>({
    queryKey: ['my-incidents'],
    queryFn: () => listMyIncidents(),
    enabled: !!accessToken,
    staleTime: 30_000,
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = incidents.filter((inc) => {
      if (!matchesFilter(inc.status, filter)) return false;
      if (!q) return true;
      const haystack = [
        inc.reference,
        typeMeta(inc.type).label,
        inc.type,
        inc.address ?? '',
        inc.description ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    return filtered.sort((a, b) => {
      const da = new Date(a.reportedAt).getTime();
      const db = new Date(b.reportedAt).getTime();
      return sort === 'latest' ? db - da : da - db;
    });
  }, [incidents, query, filter, sort]);

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const filterOptions: { key: HistoryFilter; label: string }[] = [
    { key: 'all',       label: t.history.filterAll },
    { key: 'ongoing',   label: t.history.filterOngoing },
    { key: 'resolved',  label: t.history.filterResolved },
    { key: 'cancelled', label: t.history.filterCancelled },
  ];

  const controls = (
    <View style={styles.controls}>
      {ListHeader}
      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder={t.history.searchPlaceholder}
      />
      <View style={styles.filterRow}>
        <View style={styles.filterFlex}>
          <SegmentedFilter options={filterOptions} value={filter} onChange={setFilter} />
        </View>
        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setSort((s) => (s === 'latest' ? 'oldest' : 'latest'))}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={sort === 'latest' ? t.history.sortLatest : t.history.sortOldest}
        >
          <Ionicons name="swap-vertical" size={14} color={colors.textMid} />
          <Text style={styles.sortText}>
            {sort === 'latest' ? t.history.sortLatest : t.history.sortOldest}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Signed-out guests have no personal history to show.
  if (!accessToken) {
    return (
      <View style={styles.stateWrap}>
        <StateIcon icon="lock-closed-outline" />
        <Text style={styles.stateTitle}>{t.history.loginTitle}</Text>
        <Text style={styles.stateSub}>{t.history.loginSubtitle}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.stateWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.stateWrap}>
        <StateIcon icon="cloud-offline-outline" tone={colors.danger} />
        <Text style={styles.stateTitle}>{t.history.errorTitle}</Text>
        <Text style={styles.stateSub}>{t.history.errorSubtitle}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} activeOpacity={0.85}>
          <Text style={styles.retryText}>{t.history.retry}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasAny = incidents.length > 0;

  return (
    <FlatList
      data={visible}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <IncidentHistoryCard incident={item} onPress={() => onOpenIncident(item.id)} />
      )}
      ListHeaderComponent={controls}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <StateIcon icon={hasAny ? 'search-outline' : 'document-text-outline'} />
          <Text style={styles.stateTitle}>
            {hasAny ? t.history.emptyFilteredTitle : t.history.emptyTitle}
          </Text>
          <Text style={styles.stateSub}>
            {hasAny ? t.history.emptyFilteredSubtitle : t.history.emptySubtitle}
          </Text>
        </View>
      }
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    />
  );
}

function StateIcon({ icon, tone = colors.primary }: { icon: any; tone?: string }) {
  return (
    <View style={[styles.stateIcon, { backgroundColor: `${tone}14` }]}>
      <Ionicons name={icon} size={34} color={tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 4, flexGrow: 1 },
  controls: { gap: 12, marginBottom: 4 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  filterFlex: { flex: 1, minWidth: 0 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortText: { fontSize: 13, fontWeight: '700', color: colors.textMid },

  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56, paddingHorizontal: 32 },
  stateIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  stateTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 6, textAlign: 'center' },
  stateSub: { fontSize: 14, color: colors.textSub, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: 20, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: radius.md, backgroundColor: colors.primary,
  },
  retryText: { fontSize: 14, fontWeight: '700', color: colors.white },
});
