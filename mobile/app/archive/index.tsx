import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BottomNav } from '@/src/components/ui/bottom-nav';
import { IncidentHistoryList } from '@/src/components/incidents/incident-history-list';
import {
  getAnnouncementArchive,
  type Announcement,
} from '@/src/services/api/announcements.api';

type ArchiveTab = 'incidents' | 'announcements';

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

function ArchiveAnnouncementCard({
  announcement,
  onPress,
}: {
  announcement: Announcement;
  onPress: () => void;
}) {
  const statusLabel = announcement.status === 'CANCELLED'
    ? 'Cancelled notice'
    : announcement.status === 'SUPERSEDED'
      ? 'Superseded'
      : 'Archived';

  return (
    <TouchableOpacity
      style={styles.announcementCard}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${announcement.title}, ${statusLabel}`}
    >
      <View style={styles.cardIcon}>
        <Ionicons name="megaphone-outline" size={19} color={TEAL} />
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardMeta}>
          <Text style={styles.statusLabel}>{statusLabel}</Text>
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

export default function ArchiveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<ArchiveTab>(
    params.tab === 'announcements' ? 'announcements' : 'incidents',
  );
  useEffect(() => {
    if (params.tab === 'announcements' || params.tab === 'incidents') {
      setTab(params.tab);
    }
  }, [params.tab]);
  const {
    data: announcements = [],
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useQuery<Announcement[]>({
    queryKey: ['announcement-archive'],
    queryFn: getAnnouncementArchive,
    enabled: tab === 'announcements',
    staleTime: 60_000,
  });

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Archives</Text>
          <Text style={styles.subtitle}>Your incident history and past public notices.</Text>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          <ArchiveTabButton
            label="Incident history"
            icon="document-text-outline"
            selected={tab === 'incidents'}
            onPress={() => setTab('incidents')}
          />
          <ArchiveTabButton
            label="Announcements"
            icon="megaphone-outline"
            selected={tab === 'announcements'}
            onPress={() => setTab('announcements')}
          />
        </View>

        {tab === 'incidents' ? (
          <IncidentHistoryList
            onOpenIncident={(id) =>
              router.push({ pathname: '/history/[id]', params: { id } } as never)
            }
            bottomPadding={120}
          />
        ) : isLoading ? (
          <View style={styles.state}>
            <ActivityIndicator color={TEAL} size="large" />
          </View>
        ) : isError ? (
          <View style={styles.state}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cloud-offline-outline" size={30} color="#8795A3" />
            </View>
            <Text style={styles.emptyTitle}>Could not load announcement archive</Text>
            <Text style={styles.emptySubtitle}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void refetch()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={announcements}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ArchiveAnnouncementCard
                announcement={item}
                onPress={() =>
                  router.push({ pathname: '/announcements/[id]', params: { id: item.id } } as never)
                }
              />
            )}
            contentContainerStyle={styles.list}
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
                  <Ionicons name="archive-outline" size={30} color={TEAL} />
                </View>
                <Text style={styles.emptyTitle}>No past announcements</Text>
                <Text style={styles.emptySubtitle}>
                  Archived and withdrawn public notices will appear here.
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
      <BottomNav />
    </View>
  );
}

function ArchiveTabButton({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabButton, selected && styles.tabButtonSelected]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      <Ionicons name={icon} size={16} color={selected ? TEAL : '#718096'} />
      <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F5F8' },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  title: { fontSize: 25, fontWeight: '800', color: '#14231F', letterSpacing: -0.5 },
  subtitle: { marginTop: 4, fontSize: 13, color: '#718096' },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 5,
    borderRadius: 15,
    backgroundColor: '#E7ECEF',
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 11,
  },
  tabButtonSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#172B26',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  tabText: { fontSize: 12, fontWeight: '600', color: '#718096' },
  tabTextSelected: { color: TEAL, fontWeight: '800' },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120, flexGrow: 1 },
  announcementCard: {
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
  statusLabel: { fontSize: 10, fontWeight: '800', color: '#637589', textTransform: 'uppercase' },
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
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1D2B3A', textAlign: 'center' },
  emptySubtitle: { marginTop: 5, fontSize: 13, color: '#718096', textAlign: 'center', lineHeight: 19 },
  retryButton: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12, backgroundColor: TEAL },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
