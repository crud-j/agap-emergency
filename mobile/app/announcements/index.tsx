import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Easing,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  getAnnouncements,
  announcementImageSource,
  type Announcement,
} from '@/src/services/api/announcements.api';
import { BottomNav } from '@/src/components/ui/bottom-nav';
import { useAccessibilityStore } from '@/src/stores/accessibility.store';

const TEAL = '#0D6053';

// Shares the bottom nav's palette, radii and motion so the feed reads as one system.
const THEME = {
  white: '#FFFFFF',
  primary: '#0D6053',
  primaryBright: '#17917C',
  primarySoft: '#E6F4F1',
  surface: '#F6F8FA',
  muted: '#66768A',
  ink: '#1D2B3A',
  border: '#E9ECEB',
  danger: '#E5484D',
  dangerDeep: '#B4232A',
};

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

/* -------------------------------------------------------------------------- */
/*                                   MOTION                                   */
/* -------------------------------------------------------------------------- */

const PRESS_SPRING = { tension: 320, friction: 18, useNativeDriver: true } as const;
// Entrance stagger is capped so a long feed never waits on its last card.
const MAX_STAGGER = 6;

/** Spring-to-scale on press, like the nav tabs. Instant when reduced motion is on. */
function usePressScale(reducedMotion: boolean, pressedScale = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (toValue: number) =>
    reducedMotion ? scale.setValue(1) : Animated.spring(scale, { toValue, ...PRESS_SPRING }).start();
  return { scale, onPressIn: () => to(pressedScale), onPressOut: () => to(1) };
}

/** Fade + rise on mount, staggered by position — the quick-actions menu's reveal. */
function useRiseIn(index: number, reducedMotion: boolean) {
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      delay: Math.min(index, MAX_STAGGER) * 55,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, []);
  return {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };
}

function openAnnouncement(router: ReturnType<typeof useRouter>, id: string) {
  router.push({ pathname: '/announcements/[id]', params: { id } } as any);
}

/* -------------------------------------------------------------------------- */
/*                                 COMPONENTS                                 */
/* -------------------------------------------------------------------------- */

function CriticalBanner({ item, index, reducedMotion }: { item: Announcement; index: number; reducedMotion: boolean }) {
  const router = useRouter();
  const cfg = SEVERITY_CONFIG.CRITICAL;
  const rise = useRiseIn(index, reducedMotion);
  const press = usePressScale(reducedMotion, 0.98);

  return (
    <Animated.View style={[styles.criticalWrap, rise]}>
      <Pressable
        onPress={() => openAnnouncement(router, item.id)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`Critical: ${item.title}`}
      >
        <Animated.View style={{ transform: [{ scale: press.scale }] }}>
          <LinearGradient
            colors={[THEME.danger, THEME.dangerDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.criticalBanner}
          >
            <View style={styles.criticalIconWrap}>
              <Ionicons name={cfg.icon as any} size={22} color={THEME.white} />
            </View>
            <View style={styles.flexText}>
              <View style={styles.criticalLabelRow}>
                <View style={styles.criticalTag}>
                  <Text style={styles.criticalTagText}>CRITICAL</Text>
                </View>
                <Text style={styles.criticalMeta} numberOfLines={1}>
                  {categoryLabel(item.category)} · {formatRelative(item.published_at)}
                </Text>
              </View>
              <Text style={styles.criticalTitle} numberOfLines={2}>{item.title}</Text>
              {item.summary ? (
                <Text style={styles.criticalSummary} numberOfLines={2}>{item.summary}</Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.85)" />
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function FilterChip({
  label,
  active,
  reducedMotion,
  onPress,
}: {
  label: string;
  active: boolean;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const press = usePressScale(reducedMotion, 0.94);
  // Cross-fade like the nav tabs so the active-state change runs on the native driver.
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: reducedMotion ? 0 : 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [active, reducedMotion]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Filter: ${label}`}
    >
      <Animated.View style={[styles.filterChip, { transform: [{ scale: press.scale }] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <LinearGradient
            colors={[THEME.primary, THEME.primaryBright]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.filterChipFill}
          />
        </Animated.View>
        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function AnnouncementCard({ item, index, reducedMotion }: { item: Announcement; index: number; reducedMotion: boolean }) {
  const router = useRouter();
  const cfg = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.INFORMATIONAL;
  const image = announcementImageSource(item);
  const [imageFailed, setImageFailed] = useState(false);
  const preview = item.summary ?? item.body;
  const rise = useRiseIn(index, reducedMotion);
  const press = usePressScale(reducedMotion);

  return (
    <Animated.View style={[styles.cardWrap, rise]}>
      <Pressable
        onPress={() => openAnnouncement(router, item.id)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <Animated.View style={[styles.card, { transform: [{ scale: press.scale }] }]}>
          {/* Severity is carried by icon + label, never colour alone. */}
          <View style={styles.cardHeaderRow}>
            <View style={[styles.severityIcon, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
            </View>
            <View style={styles.flexText}>
              <View style={styles.cardMetaRow}>
                <View style={[styles.severityChip, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.severityText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
                <Text style={styles.cardCategory} numberOfLines={1}>{categoryLabel(item.category)}</Text>
              </View>
              <Text style={styles.cardTime}>{formatRelative(item.published_at)}</Text>
            </View>
            <View style={styles.chevronWrap}>
              <Ionicons name="chevron-forward" size={16} color={THEME.muted} />
            </View>
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {preview ? <Text style={styles.cardPreview} numberOfLines={2}>{preview}</Text> : null}

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
            <View style={styles.footerPill}>
              <Ionicons name="location-outline" size={12} color={THEME.primary} />
              <Text style={styles.footerPillText} numberOfLines={1}>{areaLabel(item)}</Text>
            </View>
            {item.issuing_office ? (
              <Text style={styles.cardIssuer} numberOfLines={1}>{item.issuing_office}</Text>
            ) : null}
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function SmsSubscribeCta({ reducedMotion }: { reducedMotion: boolean }) {
  const router = useRouter();
  const press = usePressScale(reducedMotion);
  return (
    <Pressable
      onPress={() => router.push('/announcements/subscribe' as any)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel="Subscribe to SMS announcements"
    >
      <Animated.View style={[styles.subscribeCta, { transform: [{ scale: press.scale }] }]}>
        <View style={styles.subscribeIconWrap}>
          <Ionicons name="chatbox-ellipses" size={20} color={THEME.primary} />
        </View>
        <View style={styles.flexText}>
          <Text style={styles.subscribeTitle}>Get SMS alerts without an account</Text>
          <Text style={styles.subscribeSub}>Enter your mobile number to receive critical MDRRMO announcements via SMS.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={THEME.primary} />
      </Animated.View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   SCREEN                                   */
/* -------------------------------------------------------------------------- */

export default function AnnouncementsScreen() {
  const router = useRouter();
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);
  const archiveScale = useRef(new Animated.Value(1)).current;
  const [category, setCategory] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data = [], isLoading, isError, refetch } = useQuery<Announcement[]>({
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
      {criticals.map((a, i) => (
        <CriticalBanner key={a.id} item={a} index={i} reducedMotion={reducedMotion} />
      ))}

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.value}
            label={c.label}
            active={category === c.value}
            reducedMotion={reducedMotion}
            onPress={() => setCategory(c.value)}
          />
        ))}
      </ScrollView>

      {rest.length === 0 && !isLoading && (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="megaphone-outline" size={28} color={THEME.primary} />
          </View>
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
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Announcements</Text>
          <Text style={styles.headerSub}>Office of the Mayor · MDRRMO Bocaue</Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/archive', params: { tab: 'announcements' } } as never)}
          onPressIn={() => {
            if (!reducedMotion) {
              Animated.spring(archiveScale, {
                toValue: 0.95,
                tension: 320,
                friction: 16,
                useNativeDriver: true,
              }).start();
            }
          }}
          onPressOut={() => {
            if (reducedMotion) {
              archiveScale.setValue(1);
            } else {
              Animated.spring(archiveScale, {
                toValue: 1,
                tension: 260,
                friction: 14,
                useNativeDriver: true,
              }).start();
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Open archived announcements"
          style={styles.archivePressable}
        >
          <Animated.View style={[styles.archiveButton, { transform: [{ scale: archiveScale }] }]}>
            <Ionicons name="archive-outline" size={17} color={TEAL} />
            <Text style={styles.archiveButtonText}>Archive</Text>
          </Animated.View>
        </Pressable>
      </SafeAreaView>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={TEAL} />
        </View>
      ) : isError ? (
        <View style={styles.loadingWrap}>
          <Ionicons name="cloud-offline-outline" size={34} color="#8795A3" />
          <Text style={styles.emptyTitle}>Could not load announcements</Text>
          <Text style={styles.emptySub}>Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <AnnouncementCard item={item} index={criticals.length + index} reducedMotion={reducedMotion} />
          )}
          ListHeaderComponent={listHeader}
          ListFooterComponent={
            <View style={styles.footer}>
              <SmsSubscribeCta reducedMotion={reducedMotion} />
              <View style={styles.broadcastNotice}>
                <Ionicons name="radio-outline" size={13} color={THEME.muted} style={{ marginRight: 6 }} />
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

/* -------------------------------------------------------------------------- */
/*                                   STYLES                                   */
/* -------------------------------------------------------------------------- */

const shadow = (color: string, opacity: number, radius: number, y: number, elevation: number) =>
  Platform.select({
    ios: { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height: y } },
    android: { elevation },
  });

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F5F8' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168,181,193,0.18)',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: '#6B7280', marginTop: 2 },
  archivePressable: { flexShrink: 0 },
  archiveButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: '#EEF7F4',
    borderWidth: 1,
    borderColor: 'rgba(13,96,83,0.16)',
  },
  archiveButtonText: { color: TEAL, fontSize: 12, fontWeight: '800' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: TEAL },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Clears the floating bottom nav and its raised + button.
  listContent: { paddingBottom: 140 },
  flexText: { flex: 1, minWidth: 0 },

  // Critical banner — same treatment as the nav's emergency tile.
  criticalWrap: { marginHorizontal: 16, marginTop: 14 },
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    ...shadow(THEME.dangerDeep, 0.28, 12, 6, 6),
  },
  criticalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  criticalLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  criticalTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.22)' },
  criticalTagText: { fontSize: 10, fontWeight: '800', color: THEME.white, letterSpacing: 0.6 },
  criticalMeta: { flexShrink: 1, fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  criticalTitle: { fontSize: 15, fontWeight: '800', color: THEME.white, lineHeight: 20 },
  criticalSummary: { fontSize: 12.5, color: 'rgba(255,255,255,0.88)', lineHeight: 18, marginTop: 3 },

  // Filter chips — pill with the nav blob's gradient when active.
  filterRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  filterChip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: THEME.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border,
  },
  filterChipFill: { flex: 1, borderRadius: 18 },
  filterChipText: { fontSize: 13, fontWeight: '600', color: THEME.muted },
  filterChipTextActive: { color: THEME.white, fontWeight: '700' },

  // Announcement card
  cardWrap: { marginHorizontal: 16, marginBottom: 12 },
  card: {
    padding: 14,
    borderRadius: 22,
    backgroundColor: THEME.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border,
    ...shadow('#18231F', 0.07, 12, 4, 2),
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  severityIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  severityChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  severityText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.2 },
  cardCategory: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: THEME.ink },
  cardTime: { marginTop: 2, fontSize: 11.5, color: THEME.muted },
  chevronWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.surface,
  },

  cardTitle: { fontSize: 15.5, fontWeight: '800', color: THEME.ink, lineHeight: 21, letterSpacing: -0.1 },
  cardPreview: { marginTop: 4, fontSize: 13, color: THEME.muted, lineHeight: 19 },
  cardImage: { width: '100%', height: 150, borderRadius: 16, marginTop: 12, backgroundColor: '#EDF1F4' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: THEME.border,
  },
  footerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: THEME.primarySoft,
  },
  footerPillText: { flexShrink: 1, fontSize: 11.5, fontWeight: '600', color: THEME.primary },
  cardIssuer: { flexShrink: 2, fontSize: 11.5, color: THEME.muted },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.primarySoft,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: THEME.ink, marginTop: 12, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: THEME.muted, textAlign: 'center', lineHeight: 19 },

  // Footer
  footer: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },

  // SMS tile — matches the nav's secondary quick-action tiles.
  subscribeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: THEME.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border,
  },
  subscribeIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.primarySoft,
  },
  subscribeTitle: { fontSize: 14, fontWeight: '700', color: THEME.ink, marginBottom: 2 },
  subscribeSub:   { fontSize: 12, color: THEME.muted, lineHeight: 17 },

  broadcastNotice: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 4, paddingBottom: 4,
  },
  broadcastText: { fontSize: 11.5, color: THEME.muted, flex: 1, lineHeight: 16 },
});
