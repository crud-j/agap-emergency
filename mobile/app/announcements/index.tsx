import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  getAnnouncements,
  announcementImageSource,
  type Announcement,
} from '@/src/services/api/announcements.api';
import { BottomNav } from '@/src/components/ui/bottom-nav';

const TEAL = '#0D6053';

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  CRITICAL:      { color: '#D44858', bg: '#FDF0F1', icon: 'alert-circle',         label: 'Critical' },
  WARNING:       { color: '#D97706', bg: '#FFFBEB', icon: 'warning',               label: 'Warning' },
  ADVISORY:      { color: '#3B82F6', bg: '#EFF6FF', icon: 'information-circle',    label: 'Advisory' },
  INFORMATIONAL: { color: '#0D6053', bg: '#EEF7F4', icon: 'megaphone',             label: 'Info' },
};

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'FLOOD_ALERT',        label: 'Flood' },
  { value: 'WEATHER_ADVISORY',   label: 'Weather' },
  { value: 'EVACUATION_ORDER',   label: 'Evacuation' },
  { value: 'CLASS_SUSPENSION',   label: 'Class' },
  { value: 'ROAD_CLOSURE',       label: 'Road' },
  { value: 'FIRE_ADVISORY',      label: 'Fire' },
  { value: 'POST_DISASTER_UPDATE', label: 'Post-Disaster' },
  { value: 'PUBLIC_ADVISORY',    label: 'Advisory' },
];

const CATEGORY_LABELS: Record<string, string> = {
  FLOOD_ALERT: 'Flood',
  WEATHER_ADVISORY: 'Weather',
  EVACUATION_ORDER: 'Evacuation',
  CLASS_SUSPENSION: 'Class suspension',
  ROAD_CLOSURE: 'Traffic',
  PUBLIC_ADVISORY: 'Public advisory',
  MUNICIPAL_SERVICE: 'Municipal service',
  FIRE_ADVISORY: 'Fire',
  INDUSTRIAL_HAZARD: 'Industrial hazard',
  POST_DISASTER_UPDATE: 'Post-disaster',
  RESCUE_UPDATE: 'Rescue',
  GENERAL_INFORMATION: 'General',
};

const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c.replace(/_/g, ' ');

function areaLabel(a: Announcement): string {
  return a.scope === 'MUNICIPALITY_WIDE' || a.target_barangays.length === 0
    ? 'All of Bocaue'
    : `Brgy. ${a.target_barangays.join(', ')}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function CriticalBanner({ item }: { item: Announcement }) {
  const router = useRouter();
  const cfg = SEVERITY_CONFIG.CRITICAL;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: item.id } } as any)}
      style={styles.criticalWrap}
      accessibilityRole="button"
      accessibilityLabel={`Critical: ${item.title}`}
    >
      <View style={styles.criticalBanner}>
        <View style={styles.criticalRow}>
          <View style={styles.criticalIconWrap}>
            <Ionicons name={cfg.icon as any} size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.criticalLabelRow}>
              <Text style={styles.criticalTag}>CRITICAL</Text>
              <Text style={styles.criticalMeta}>
                {categoryLabel(item.category)} · {formatRelative(item.published_at)}
              </Text>
            </View>
            <Text style={styles.criticalTitle} numberOfLines={2}>{item.title}</Text>
            {item.summary ? (
              <Text style={styles.criticalSummary} numberOfLines={2}>{item.summary}</Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function AnnouncementCard({ item }: { item: Announcement }) {
  const router = useRouter();
  const cfg = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.INFORMATIONAL;
  const image = announcementImageSource(item);
  const [imageFailed, setImageFailed] = useState(false);
  const preview = item.summary ?? item.body;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.82}
      onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: item.id } } as any)}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={[styles.cardAccent, { backgroundColor: cfg.color }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeaderRow}>
          <View style={[styles.severityChip, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon as any} size={10} color={cfg.color} style={{ marginRight: 3 }} />
            <Text style={[styles.severityText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.cardCategory} numberOfLines={1}>{categoryLabel(item.category)}</Text>
          <Text style={styles.cardTime}>{formatRelative(item.published_at)}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {preview ? <Text style={styles.cardBody2} numberOfLines={2}>{preview}</Text> : null}
        {image && !imageFailed ? (
          <Image
            source={image}
            style={styles.cardImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
            accessibilityIgnoresInvertColors
            accessible
            accessibilityLabel={item.image_alt_text ?? 'Announcement image'}
          />
        ) : null}
        <View style={styles.cardFooter}>
          <Ionicons name="location-outline" size={11} color="#9CA3AF" />
          <Text style={styles.cardScope} numberOfLines={1}>{areaLabel(item)}</Text>
          {item.issuing_office ? (
            <Text style={styles.cardIssuer} numberOfLines={1}>· {item.issuing_office}</Text>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#C4CDD6" style={styles.cardChevron} />
    </TouchableOpacity>
  );
}

function SmsSubscribeCta() {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.subscribeCta}
      activeOpacity={0.88}
      onPress={() => router.push('/announcements/subscribe' as any)}
      accessibilityRole="button"
      accessibilityLabel="Subscribe to SMS announcements"
    >
      <View style={styles.subscribeIconWrap}>
        <Ionicons name="chatbox-ellipses" size={18} color={TEAL} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.subscribeTitle}>Get SMS alerts without an account</Text>
        <Text style={styles.subscribeSub}>Enter your mobile number to receive critical MDRRMO announcements via SMS.</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={TEAL} />
    </TouchableOpacity>
  );
}

export default function AnnouncementsScreen() {
  const [category, setCategory] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data = [], isLoading, refetch } = useQuery<Announcement[]>({
    queryKey: ['announcements', category],
    queryFn: () => getAnnouncements({ category: category || undefined }),
    staleTime: 60_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const criticals = data.filter((a) => a.severity === 'CRITICAL');
  const rest      = data.filter((a) => a.severity !== 'CRITICAL');

  const listHeader = (
    <>
      {/* Critical banners — high-visibility treatment required by spec (color + icon, not color alone) */}
      {criticals.map((a) => <CriticalBanner key={a.id} item={a} />)}

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.value}
            style={[styles.filterChip, category === c.value && styles.filterChipActive]}
            onPress={() => setCategory(c.value)}
            accessibilityRole="button"
            accessibilityLabel={`Filter: ${c.label}`}
          >
            <Text style={[styles.filterChipText, category === c.value && styles.filterChipTextActive]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {rest.length === 0 && !isLoading && (
        <View style={styles.empty}>
          <Ionicons name="megaphone-outline" size={38} color="#C4CDD6" />
          <Text style={styles.emptyTitle}>No announcements</Text>
          <Text style={styles.emptySub}>
            {category
              ? 'Try a different category filter.'
              : 'Official notices from the Mayor’s Office and MDRRMO will appear here.'}
          </Text>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <Text style={styles.headerTitle}>Announcements</Text>
        <Text style={styles.headerSub}>Office of the Mayor · MDRRMO Bocaue</Text>
      </SafeAreaView>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={TEAL} />
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AnnouncementCard item={item} />}
          ListHeaderComponent={listHeader}
          ListFooterComponent={
            <View style={styles.footer}>
              <SmsSubscribeCta />
              <View style={styles.broadcastNotice}>
                <Ionicons name="radio-outline" size={13} color="#6B7280" style={{ marginRight: 6 }} />
                <Text style={styles.broadcastText}>
                  One-way broadcast only. Not a substitute for 911 or MDRRMO hotline calls.
                </Text>
              </View>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />
          }
        />
      )}

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F5F8' },

  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168,181,193,0.18)',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: '#6B7280', marginTop: 2 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent: { paddingBottom: 24 },

  // Critical banner
  criticalWrap: { marginHorizontal: 16, marginTop: 14 },
  criticalBanner: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#9F1D2C',
  },
  criticalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  criticalIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  criticalLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  criticalTag:  { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5 },
  criticalMeta: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  criticalTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', lineHeight: 19 },
  criticalSummary: { fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17, marginTop: 3 },

  // Filter chips
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(168,181,193,0.30)',
  },
  filterChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  filterChipText:       { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterChipTextActive: { color: '#FFFFFF' },

  // Announcement card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#8795A3',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardAccent:  { width: 4, alignSelf: 'stretch' },
  cardBody:    { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
  cardChevron: { marginRight: 10 },

  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  severityChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
  },
  severityText: { fontSize: 10, fontWeight: '700' },
  cardCategory: { fontSize: 10, color: '#9CA3AF', flex: 1 },
  cardTime:     { fontSize: 10, color: '#9CA3AF' },

  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 20, marginBottom: 6 },
  cardImage: { width: '100%', height: 140, borderRadius: 8, marginBottom: 8, backgroundColor: '#EDF1F4' },
  cardBody2: { fontSize: 12, color: '#4B5563', lineHeight: 17, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardScope: { fontSize: 11, color: '#9CA3AF', flexShrink: 1 },
  cardIssuer: { fontSize: 11, color: '#9CA3AF', flexShrink: 2 },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 19 },

  // Footer
  footer: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },

  subscribeCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#EEF7F4',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(13,96,83,0.15)',
  },
  subscribeIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  subscribeTitle: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 2 },
  subscribeSub:   { fontSize: 11, color: '#6B7280', lineHeight: 16 },

  broadcastNotice: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 4, paddingBottom: 4,
  },
  broadcastText: { fontSize: 11, color: '#9CA3AF', flex: 1, lineHeight: 16 },
});
