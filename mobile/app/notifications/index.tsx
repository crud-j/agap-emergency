import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  StatusBar, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNotificationList, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/src/hooks/useNotifications';
import type { AppNotification } from '@/src/services/api/notifications.api';

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
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useNotificationList(1);
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAll, isPending: markingAll } = useMarkAllNotificationsRead();

  const notifications = data?.data ?? [];
  const unread = notifications.filter((n) => n.status === 'PENDING').length;

  // Build grouped flat list
  const listItems: ListItem[] = [];
  let lastDateLabel = '';
  for (const n of notifications) {
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
      router.push({ pathname: '/incident/[id]', params: { id: notif.incident_id } } as never);
    } else if (notif.event_type === 'ANNOUNCEMENT' && typeof notif.data_payload?.announcementId === 'string') {
      router.push({ pathname: '/announcements/[id]', params: { id: notif.data_payload.announcementId } } as never);
    }
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1C2B3A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0D6053" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1C2B3A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color="#C3CDD8" />
          <Text style={styles.errorTitle}>Could not load notifications</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C2B3A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Notifications{unread > 0 ? ` (${unread})` : ''}
        </Text>
        {unread > 0 ? (
          <TouchableOpacity
            onPress={() => markAll()}
            disabled={markingAll}
            style={styles.markAllBtn}
          >
            <Ionicons name="checkmark-done-outline" size={20} color="#0D6053" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      {/* ── List ──────────────────────────────────────────────────────── */}
      {listItems.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-off-outline" size={36} color="#C3CDD8" />
          </View>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptySub}>No notifications yet.</Text>
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
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#F5F7FA', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BEVEL },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C2B3A', flex: 1, textAlign: 'center' },
  backBtn:     { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  markAllBtn:  { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },

  list: { paddingBottom: 120 },

  sectionHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  sectionLabel:  { fontSize: 12, fontWeight: '700', color: '#8795A3', letterSpacing: 0.5, textTransform: 'uppercase' },

  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BEVEL },
  rowUnread: { backgroundColor: '#F3FAF7' },
  rowBody:   { flex: 1, gap: 2 },
  rowTop:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },

  iconWrap:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  typeLabel:  { fontSize: 11, fontWeight: '700', color: '#8795A3', textTransform: 'uppercase', letterSpacing: 0.4 },
  timeText:   { fontSize: 11, color: '#C3CDD8' },
  titleText:  { fontSize: 14, fontWeight: '700', color: '#1C2B3A', lineHeight: 19 },
  titleRead:  { fontWeight: '500' },
  bodyText:   { fontSize: 13, color: '#40536D', lineHeight: 18 },
  unreadDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0D6053', marginTop: 6 },

  emptyIcon:  { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EDF1F4', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1C2B3A' },
  emptySub:   { fontSize: 13, color: '#8795A3' },

  errorTitle: { fontSize: 15, fontWeight: '600', color: '#1C2B3A' },
  retryBtn:   { marginTop: 8, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  retryText:  { color: '#FFFFFF', fontWeight: '700' },
});
