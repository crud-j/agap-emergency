import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { colors, cardShadow, radius } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/stores/auth.store';
import { useTranslations } from '../../src/hooks/useAccessibility';
import {
  getIncidentHistoryDetail,
  type IncidentHistoryDetail,
  type IncidentNotificationEntry,
} from '../../src/services/api/incidents.api';
import { SegmentedFilter } from '../../src/components/ui/segmented-filter';
import { IncidentTypeIcon } from '../../src/components/incidents/incident-type-icon';
import { IncidentStatusBadge } from '../../src/components/incidents/incident-status-badge';
import { typeMeta, statusMeta } from '../../src/components/incidents/incident-meta';
import { formatDateTime, formatTime } from '../../src/components/incidents/format';

type Tab = 'overview' | 'timeline' | 'notifications' | 'location' | 'resolution';

// ─── Channel / delivery presentation ────────────────────────────────────────

const CHANNEL_ICON: Record<string, any> = {
  SMS: 'chatbubble-ellipses-outline',
  PUSH: 'notifications-outline',
  EMAIL: 'mail-outline',
  IN_APP: 'phone-portrait-outline',
  SYSTEM: 'desktop-outline',
};

const DELIVERED = new Set(['SENT', 'DELIVERED']);
const FAILED = new Set(['FAILED', 'UNDELIVERED']);

function deliveryTone(status: string) {
  if (DELIVERED.has(status)) return { fg: colors.primary, icon: 'checkmark-circle' as const };
  if (FAILED.has(status)) return { fg: colors.danger, icon: 'close-circle' as const };
  return { fg: colors.amber, icon: 'time' as const };
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function IncidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tab, setTab] = useState<Tab>('overview');

  const { data, isLoading, isError, refetch } = useQuery<IncidentHistoryDetail>({
    queryKey: ['incident-detail', id],
    queryFn: () => getIncidentHistoryDetail(id!, accessToken!),
    enabled: !!id && !!accessToken,
    staleTime: 30_000,
  });

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/history');
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.topBarTitleWrap}>
            <Text style={styles.topBarTitle}>{t.history.detailTitle}</Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        {isLoading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : isError || !data ? (
          <View style={styles.stateWrap}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
            <Text style={styles.stateTitle}>{t.history.errorTitle}</Text>
            <Text style={styles.stateSub}>{t.history.errorSubtitle}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryText}>{t.history.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <HeaderCard data={data} />

            <View style={styles.tabs}>
              <SegmentedFilter
                value={tab}
                onChange={(k) => setTab(k as Tab)}
                options={[
                  { key: 'overview',      label: t.history.tabOverview },
                  { key: 'timeline',      label: t.history.tabTimeline },
                  { key: 'notifications', label: t.history.tabNotifications },
                  { key: 'location',      label: t.history.tabLocation },
                  { key: 'resolution',    label: t.history.tabResolution },
                ]}
              />
            </View>

            {tab === 'overview' && <OverviewTab data={data} />}
            {tab === 'timeline' && <TimelineTab data={data} />}
            {tab === 'notifications' && <NotificationsTab data={data} />}
            {tab === 'location' && <LocationTab data={data} />}
            {tab === 'resolution' && <ResolutionTab data={data} />}

            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Header card ────────────────────────────────────────────────────────────

function HeaderCard({ data }: { data: IncidentHistoryDetail }) {
  const meta = typeMeta(data.type);
  return (
    <View style={styles.headerCard}>
      <IncidentTypeIcon type={data.type} size={52} />
      <View style={styles.headerBody}>
        <Text style={styles.headerTitle} numberOfLines={1}>{meta.label}</Text>
        <Text style={styles.headerRef}>{data.reference}</Text>
        <View style={styles.headerMetaRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.textSub} />
          <Text style={styles.headerMeta}>{formatDateTime(data.reportedAt)}</Text>
        </View>
      </View>
      <IncidentStatusBadge status={data.status} />
    </View>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: IncidentHistoryDetail }) {
  const reporterName = data.reporter.name ?? (data.reporter.isGuest ? 'Guest reporter' : 'You');
  return (
    <Section title="Incident Overview">
      {data.description ? (
        <Text style={styles.overviewText}>{data.description}</Text>
      ) : (
        <Text style={styles.emptyNote}>No description was provided.</Text>
      )}

      <View style={styles.infoGrid}>
        <InfoItem icon="pricetag-outline" label="Incident Type" value={typeMeta(data.type).label} />
        <InfoItem icon="flag-outline" label="Priority" value={titleCase(data.priority)} />
        <InfoItem
          icon="people-outline"
          label="People Involved"
          value={data.numberOfPatients != null ? String(data.numberOfPatients) : '—'}
        />
        <InfoItem icon="person-outline" label="Reported By" value={reporterName} />
      </View>
    </Section>
  );
}

// ─── Timeline ───────────────────────────────────────────────────────────────

function TimelineTab({ data }: { data: IncidentHistoryDetail }) {
  if (data.timeline.length === 0) {
    return (
      <Section title="Incident Timeline">
        <Text style={styles.emptyNote}>No timeline events yet.</Text>
      </Section>
    );
  }

  return (
    <Section title="Incident Timeline">
      {data.timeline.map((ev, i) => {
        const meta = statusMeta(ev.status);
        const last = i === data.timeline.length - 1;
        return (
          <View key={`${ev.status}-${i}`} style={styles.tlItem}>
            <View style={styles.tlLeft}>
              <View style={styles.tlDot}>
                <Ionicons name={meta.icon} size={12} color={colors.white} />
              </View>
              {!last && <View style={styles.tlConnector} />}
            </View>
            <View style={styles.tlContent}>
              <View style={styles.tlHeadRow}>
                <Text style={styles.tlStatus}>{meta.label}</Text>
                <Text style={styles.tlTime}>{formatTime(ev.at)}</Text>
              </View>
              {ev.notes ? <Text style={styles.tlNote}>{ev.notes}</Text> : null}
            </View>
          </View>
        );
      })}
    </Section>
  );
}

// ─── Notifications ──────────────────────────────────────────────────────────

function NotificationsTab({ data }: { data: IncidentHistoryDetail }) {
  if (data.notifications.length === 0) {
    return (
      <Section title="Notifications Sent">
        <Text style={styles.emptyNote}>No notifications were sent for this incident.</Text>
      </Section>
    );
  }

  return (
    <Section title="Notifications Sent">
      {data.notifications.map((n, i) => (
        <NotificationRow key={i} item={n} last={i === data.notifications.length - 1} />
      ))}
    </Section>
  );
}

function NotificationRow({ item, last }: { item: IncidentNotificationEntry; last: boolean }) {
  const tone = deliveryTone(item.status);
  return (
    <View style={[styles.notifRow, !last && styles.notifRowBorder]}>
      <View style={styles.notifIcon}>
        <Ionicons name={CHANNEL_ICON[item.channel] ?? 'notifications-outline'} size={18} color={colors.primary} />
      </View>
      <View style={styles.notifBody}>
        <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.notifMeta}>
          {titleCase(item.channel)}{item.sentAt ? ` · ${formatTime(item.sentAt)}` : ''}
        </Text>
      </View>
      <View style={styles.notifStatus}>
        <Ionicons name={tone.icon} size={14} color={tone.fg} />
        <Text style={[styles.notifStatusText, { color: tone.fg }]}>{titleCase(item.status)}</Text>
      </View>
    </View>
  );
}

// ─── Location ───────────────────────────────────────────────────────────────

function LocationTab({ data }: { data: IncidentHistoryDetail }) {
  const loc = data.location;
  if (!loc) {
    return (
      <Section title="Location">
        <Text style={styles.emptyNote}>No location was captured for this incident.</Text>
      </Section>
    );
  }

  const line =
    loc.address ??
    [loc.street, loc.barangay, loc.municipality, loc.province].filter(Boolean).join(', ');

  const canOpenMap = loc.lat != null && loc.lng != null;
  const openMap = () => {
    if (canOpenMap) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`);
  };

  return (
    <Section title="Location">
      <View style={styles.locRow}>
        <View style={styles.locIcon}>
          <Ionicons name="location" size={18} color={colors.danger} />
        </View>
        <Text style={styles.locText}>{line || 'Coordinates only'}</Text>
      </View>

      {canOpenMap && (
        <>
          {(loc.lat != null && loc.lng != null) && (
            <Text style={styles.coords}>
              {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
            </Text>
          )}
          <TouchableOpacity style={styles.mapBtn} onPress={openMap} activeOpacity={0.85}>
            <Ionicons name="map-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.mapBtnText}>View on Map</Text>
          </TouchableOpacity>
        </>
      )}
    </Section>
  );
}

// ─── Resolution ─────────────────────────────────────────────────────────────

function ResolutionTab({ data }: { data: IncidentHistoryDetail }) {
  const r = data.resolution;
  if (!r) {
    return (
      <Section title="Resolution">
        <Text style={styles.emptyNote}>This incident has not been resolved yet.</Text>
      </Section>
    );
  }

  return (
    <Section title="Resolution">
      <View style={styles.resHeadRow}>
        <View style={styles.resCheck}>
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
        </View>
        <Text style={styles.resOutcome}>{r.outcome}</Text>
      </View>

      {r.disposition && (
        <InfoItem icon="walk-outline" label="Patient Disposition" value={titleCase(r.disposition)} />
      )}
      {r.notes ? <Text style={styles.resNotes}>{r.notes}</Text> : null}

      <View style={styles.resFootRow}>
        <Ionicons name="time-outline" size={14} color={colors.textSub} />
        <Text style={styles.resFootText}>Closed {formatDateTime(r.closedAt)}</Text>
      </View>

      {r.followUpRequired && (
        <View style={styles.followUp}>
          <Ionicons name="alert-circle" size={14} color={colors.amber} style={{ marginRight: 6 }} />
          <Text style={styles.followUpText}>Follow-up required</Text>
        </View>
      )}
    </Section>
  );
}

// ─── Shared primitives ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoItem({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

function titleCase(s: string): string {
  return s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  topBar: {
    minHeight: 56,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topBarTitleWrap: { flex: 1, alignItems: 'center' },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: colors.text },

  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  stateTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 14, marginBottom: 6 },
  stateSub: { fontSize: 14, color: colors.textSub, textAlign: 'center', marginBottom: 20 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary },
  retryText: { fontSize: 14, fontWeight: '700', color: colors.white },

  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  // Header card
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  headerBody: { flex: 1, marginLeft: 14, marginRight: 8, minWidth: 0 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  headerRef: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.textSub },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  headerMeta: { fontSize: 12, fontWeight: '500', color: colors.textMid },

  tabs: { marginTop: 16, marginBottom: 12 },

  // Section
  section: {
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 14 },

  // Overview
  overviewText: { fontSize: 14, lineHeight: 21, fontWeight: '500', color: colors.textMid, marginBottom: 16 },
  emptyNote: { fontSize: 14, color: colors.textSub, fontStyle: 'italic' },
  infoGrid: { gap: 14 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { fontSize: 12, fontWeight: '600', color: colors.textSub },
  infoValue: { marginTop: 2, fontSize: 14, fontWeight: '700', color: colors.text },

  // Timeline
  tlItem: { flexDirection: 'row', alignItems: 'flex-start' },
  tlLeft: { width: 28, alignItems: 'center' },
  tlDot: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  tlConnector: { width: 2, flex: 1, minHeight: 24, backgroundColor: colors.track, marginVertical: 2 },
  tlContent: { flex: 1, paddingLeft: 12, paddingBottom: 18 },
  tlHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tlStatus: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  tlTime: { fontSize: 12, fontWeight: '600', color: colors.textSub },
  tlNote: { marginTop: 3, fontSize: 13, lineHeight: 19, color: colors.textSub },

  // Notifications
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  notifRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  notifIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  notifBody: { flex: 1, minWidth: 0 },
  notifTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  notifMeta: { marginTop: 2, fontSize: 12, fontWeight: '500', color: colors.textSub },
  notifStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
  notifStatusText: { fontSize: 12, fontWeight: '700' },

  // Location
  locRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  locIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  locText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
  coords: { fontSize: 12, fontWeight: '600', color: colors.textSub, marginBottom: 14 },
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 46, borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1, borderColor: 'rgba(13,96,83,0.18)',
  },
  mapBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  // Resolution
  resHeadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  resCheck: { marginRight: 10 },
  resOutcome: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  resNotes: { marginTop: 14, fontSize: 14, lineHeight: 21, color: colors.textMid },
  resFootRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  resFootText: { fontSize: 13, fontWeight: '500', color: colors.textSub },
  followUp: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 14, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
  followUpText: { fontSize: 13, fontWeight: '700', color: colors.amber },
});
