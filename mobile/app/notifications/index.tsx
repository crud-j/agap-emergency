import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  StatusBar, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNotificationList, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/src/hooks/useNotifications';
import type { AppNotification } from '@/src/services/api/notifications.api';
import { useAccessibilityStore } from '@/src/stores/accessibility.store';

// ─── Event display config ─────────────────────────────────────────────────────

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const EVENT_CONFIG: Record<string, { icon: IconName; color: string; bg: string; label: string }> = {
  DISPATCH_CREATED:        { icon: 'car-outline',         color: '#D97706', bg: '#FFF7ED', label: 'Dispatched' },
  DISPATCH_UPDATED:        { icon: 'car-outline',         color: '#D97706', bg: '#FFF7ED', label: 'Dispatch update' },
  INCIDENT_CREATED:        { icon: 'alert-circle-outline',color: '#DC2626', bg: '#FEF2F2', label: 'New incident' },
  INCIDENT_UPDATED:        { icon: 'refresh-outline',     color: '#3B82F6', bg: '#EFF6FF', label: 'Incident update' },
  INCIDENT_ESCALATED:      { icon: 'trending-up-outline', color: '#DC2626', bg: '#FEF2F2', label: 'Escalation' },
  INCIDENT_STATUS_CHANGED: { icon: 'sync-outline',        color: '#3B82F6', bg: '#EFF6FF', label: 'Status change' },
  ANNOUNCEMENT:            { icon: 'megaphone-outline',   color: '#0D6053', bg: '#EEF7F4', label: 'Announcement' },
  RESPONDER_ASSIGNED:      { icon: 'person-add-outline',  color: '#7C3AED', bg: '#F5F3FF', label: 'Assignment' },
  // The reporter's incident timeline (one per status step).
  INCIDENT_ACKNOWLEDGED:      { icon: 'checkmark-circle-outline', color: '#3B82F6', bg: '#EFF6FF', label: 'Report received' },
  INCIDENT_DISPATCHED:        { icon: 'car-outline',              color: '#D97706', bg: '#FFF7ED', label: 'Dispatched' },
  INCIDENT_EN_ROUTE:          { icon: 'navigate-outline',         color: '#D97706', bg: '#FFF7ED', label: 'On the way' },
  INCIDENT_ON_SCENE:          { icon: 'location-outline',         color: '#7C3AED', bg: '#F5F3FF', label: 'Arrived' },
  INCIDENT_TRANSPORTING:      { icon: 'medkit-outline',           color: '#7C3AED', bg: '#F5F3FF', label: 'Transporting' },
  INCIDENT_ASSISTING:         { icon: 'hand-left-outline',        color: '#7C3AED', bg: '#F5F3FF', label: 'Assisting' },
  INCIDENT_RESOLVED:          { icon: 'checkmark-done-outline',   color: '#0D6053', bg: '#EEF7F4', label: 'Resolved' },
  INCIDENT_CLOSED:            { icon: 'shield-checkmark-outline', color: '#0D6053', bg: '#EEF7F4', label: 'Closed' },
  INCIDENT_REFERRED:          { icon: 'arrow-redo-outline',       color: '#3B82F6', bg: '#EFF6FF', label: 'Referred' },
  INCIDENT_UNABLE_TO_RESPOND: { icon: 'alert-circle-outline',     color: '#DC2626', bg: '#FEF2F2', label: 'Unable to respond' },
  INCIDENT_FALSE_ALERT:       { icon: 'close-circle-outline',     color: '#8795A3', bg: '#F5F7FA', label: 'False alert' },
  INCIDENT_DUPLICATE:         { icon: 'git-merge-outline',        color: '#8795A3', bg: '#F5F7FA', label: 'Merged' },
};

function getConfig(eventType: string) {
  const exact = EVENT_CONFIG[eventType];
  if (exact) return exact;
  const partial = Object.keys(EVENT_CONFIG).find(
    (k) => eventType.startsWith(k) || eventType.includes(k.toLowerCase()),
  );
  return partial
    ? EVENT_CONFIG[partial]
    : { icon: 'notifications-outline' as IconName, color: '#8795A3', bg: '#F5F7FA', label: 'Notification' };
}

// ─── Time formatter ───────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric' });
}

// ─── Notification row ──────────────────────────────────────────────────────────

function NotifRow({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: () => void;
}) {
  const unread = item.status === 'PENDING';
  const cfg = getConfig(item.event_type);

  return (
    <TouchableOpacity
      style={[styles.row, unread && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={item.title ?? item.body}
      accessibilityHint={unread ? 'Opens this update and marks it as read' : 'Opens this update'}
    >
      <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={18} color={cfg.color} />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.typeLabel}>{cfg.label}</Text>
          <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
        </View>
        {item.title ? (
          <Text style={[styles.titleText, !unread && styles.titleRead]} numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}
        <Text style={styles.bodyText} numberOfLines={2}>{item.body}</Text>
      </View>

      {unread && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type ListItem =
  | { type: 'header'; key: string; label: string }
  | { type: 'notif'; key: string; item: AppNotification };

export default function NotificationsScreen() {
  const router = useRouter();
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [filterWidth, setFilterWidth] = useState(0);
  const filterProgress = useRef(new Animated.Value(0)).current;

  const { data, isLoading, isError, refetch } = useNotificationList(1);
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAll, isPending: markingAll } = useMarkAllNotificationsRead();

  const notifications = data?.data ?? [];
  const unread = notifications.filter((n) => n.status === 'PENDING').length;
  const visibleNotifications = filter === 'unread'
    ? notifications.filter((n) => n.status === 'PENDING')
    : notifications;

  useEffect(() => {
    const target = filter === 'unread' ? 1 : 0;
    if (reducedMotion) {
      filterProgress.setValue(target);
      return;
    }

    const animation = Animated.spring(filterProgress, {
      toValue: target,
      tension: 220,
      friction: 18,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [filter, filterProgress, reducedMotion]);

  const segmentWidth = Math.max(0, (filterWidth - 8) / 2);
  const indicatorX = filterProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, segmentWidth],
  });

  // Build grouped flat list
  const listItems: ListItem[] = [];
  let lastDateLabel = '';
  for (const n of visibleNotifications) {
    const label = formatDate(n.created_at);
    if (label !== lastDateLabel) {
      listItems.push({ type: 'header', key: `h-${label}`, label });
      lastDateLabel = label;
    }
    listItems.push({ type: 'notif', key: n.id, item: n });
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function handlePress(notif: AppNotification) {
    if (notif.status === 'PENDING') markRead(notif.id);
    if (notif.incident_id) {
      router.push({ pathname: '/incidents/[id]', params: { id: notif.incident_id } } as never);
    } else if (notif.event_type === 'ANNOUNCEMENT' && typeof notif.data_payload?.announcementId === 'string') {
      router.push({ pathname: '/announcements/[id]', params: { id: notif.data_payload.announcementId } } as never);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={21} color="#1C2B3A" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Text style={styles.headerSub}>Emergency and community updates</Text>
          </View>
          {unread > 0 ? (
            <TouchableOpacity
              onPress={() => markAll()}
              disabled={markingAll}
              style={[styles.markAllBtn, markingAll && styles.markAllBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications as read"
            >
              {markingAll ? (
                <ActivityIndicator size="small" color="#0D6053" />
              ) : (
                <>
                  <Ionicons name="checkmark-done-outline" size={16} color="#0D6053" />
                  <Text style={styles.markAllText}>Mark read</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.markAllPlaceholder} />
          )}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="notifications" size={18} color="#0D6053" />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>
              {unread > 0 ? `${unread} unread ${unread === 1 ? 'update' : 'updates'}` : 'You’re all caught up'}
            </Text>
            <Text style={styles.summarySub}>
              {unread > 0 ? 'Review important updates below.' : 'New updates will appear here.'}
            </Text>
          </View>
          <View style={[styles.summaryStatus, unread > 0 && styles.summaryStatusActive]} />
        </View>

        <View
          style={styles.filterTrack}
          onLayout={(event) => setFilterWidth(event.nativeEvent.layout.width)}
          accessibilityRole="tablist"
        >
          {filterWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.filterIndicator,
                { width: segmentWidth, transform: [{ translateX: indicatorX }] },
              ]}
            />
          )}
          <TouchableOpacity
            style={styles.filterTab}
            onPress={() => setFilter('all')}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === 'all' }}
          >
            <Text style={[styles.filterLabel, filter === 'all' && styles.filterLabelActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.filterTab}
            onPress={() => setFilter('unread')}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === 'unread' }}
          >
            <Text style={[styles.filterLabel, filter === 'unread' && styles.filterLabelActive]}>Unread</Text>
            {unread > 0 && (
              <View style={[styles.filterCount, filter === 'unread' && styles.filterCountActive]}>
                <Text style={[styles.filterCountText, filter === 'unread' && styles.filterCountTextActive]}>
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── List ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0D6053" />
          <Text style={styles.loadingText}>Loading your updates…</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="cloud-offline-outline" size={34} color="#8795A3" />
          </View>
          <Text style={styles.errorTitle}>Could not load notifications</Text>
          <Text style={styles.emptySub}>Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : listItems.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name={filter === 'unread' ? 'checkmark-done-outline' : 'notifications-off-outline'}
              size={34}
              color={filter === 'unread' ? '#0D6053' : '#8795A3'}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}
          </Text>
          <Text style={styles.emptySub}>
            {filter === 'unread'
              ? 'You have no unread updates right now.'
              : 'Incident and announcement updates will appear here.'}
          </Text>
          {filter === 'unread' && notifications.length > 0 && (
            <TouchableOpacity style={styles.showAllBtn} onPress={() => setFilter('all')}>
              <Text style={styles.showAllText}>View all notifications</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => item.key}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#0D6053"
              colors={['#0D6053']}
            />
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <SectionHeader label={item.label} />;
            }
            return (
              <NotifRow
                item={item.item}
                onPress={() => handlePress(item.item)}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BEVEL = 'rgba(168,181,193,0.18)';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BEVEL,
    gap: 13,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1C2B3A', letterSpacing: -0.4 },
  headerSub: { marginTop: 2, fontSize: 11, color: '#718096' },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F6F8',
  },
  markAllBtn: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#E6F4F1',
  },
  markAllBtnDisabled: { opacity: 0.65 },
  markAllText: { fontSize: 11, fontWeight: '800', color: '#0D6053' },
  markAllPlaceholder: { width: 40, height: 40 },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 15,
    backgroundColor: '#F1F7F5',
    borderWidth: 1,
    borderColor: 'rgba(13,96,83,0.09)',
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  summaryCopy: { flex: 1 },
  summaryTitle: { fontSize: 13, fontWeight: '800', color: '#1D2B3A' },
  summarySub: { marginTop: 2, fontSize: 11, color: '#718096' },
  summaryStatus: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#B8C3CE' },
  summaryStatusActive: { backgroundColor: '#0D9B79' },

  filterTrack: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#E9EEF1',
  },
  filterIndicator: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#172B26',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 5,
    elevation: 2,
  },
  filterTab: {
    zIndex: 1,
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 11,
  },
  filterLabel: { fontSize: 12, fontWeight: '700', color: '#718096' },
  filterLabelActive: { color: '#0D6053', fontWeight: '800' },
  filterCount: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D9E1E6' },
  filterCountActive: { backgroundColor: '#E6F4F1' },
  filterCountText: { fontSize: 10, fontWeight: '800', color: '#637589' },
  filterCountTextActive: { color: '#0D6053' },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 30 },
  sectionHeader: { paddingTop: 15, paddingBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#718096', letterSpacing: 0.7, textTransform: 'uppercase' },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 9,
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(168,181,193,0.22)',
    backgroundColor: '#FFFFFF',
    shadowColor: '#8795A3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  rowUnread: { backgroundColor: '#F8FCFA', borderColor: 'rgba(13,96,83,0.20)' },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 1 },
  iconWrap: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  typeLabel: { flex: 1, fontSize: 10, fontWeight: '800', color: '#718096', textTransform: 'uppercase', letterSpacing: 0.5 },
  timeText: { fontSize: 10, color: '#8795A3' },
  titleText: { fontSize: 14, fontWeight: '800', color: '#1C2B3A', lineHeight: 19 },
  titleRead: { fontWeight: '600' },
  bodyText: { fontSize: 12, color: '#526477', lineHeight: 18 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0D9076', marginTop: 5 },

  emptyIcon: { width: 68, height: 68, borderRadius: 23, backgroundColor: '#EAF2F0', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1C2B3A', textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#718096', lineHeight: 19, textAlign: 'center' },
  loadingText: { fontSize: 13, color: '#718096' },
  errorTitle: { fontSize: 15, fontWeight: '700', color: '#1C2B3A' },
  retryBtn: { marginTop: 8, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontWeight: '800' },
  showAllBtn: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#E6F4F1' },
  showAllText: { color: '#0D6053', fontSize: 12, fontWeight: '800' },
});
