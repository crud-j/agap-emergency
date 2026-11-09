import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Platform,
  Share,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { colors, cardShadow, radius } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/stores/auth.store';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import {
  getIncidentHistoryDetail,
  type IncidentHistoryDetail,
  type IncidentTimelineEntry,
  type IncidentNotificationEntry,
} from '../../src/services/api/incidents.api';

// ─── Types ────────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type TabKey = 'overview' | 'timeline' | 'notifications' | 'location' | 'resolution';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview',      label: 'Overview'      },
  { key: 'timeline',      label: 'Timeline'      },
  { key: 'notifications', label: 'Notifications' },
  { key: 'location',      label: 'Location'      },
  { key: 'resolution',    label: 'Resolution'    },
];

// ─── Display maps ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  MEDICAL: 'Medical Emergency', ROAD_ACCIDENT: 'Road Traffic Accident',
  FLOOD: 'Flood / Water Emergency', NATURAL_DISASTER: 'Natural Disaster', RESCUE: 'Search & Rescue',
  FIRE: 'Fire Emergency', INDUSTRIAL: 'Industrial Hazard',
  DEBRIS: 'Debris / Structural', OTHER: 'Other Emergency',
};

const TYPE_LABELS_SHORT: Record<string, string> = {
  MEDICAL: 'Medical', ROAD_ACCIDENT: 'Road Traffic', FLOOD: 'Flood',
  NATURAL_DISASTER: 'Natural Disaster', RESCUE: 'Search & Rescue', FIRE: 'Fire', INDUSTRIAL: 'Industrial',
  DEBRIS: 'Debris', OTHER: 'Other',
};

const TYPE_ICONS: Record<string, IoniconName> = {
  MEDICAL: 'pulse', ROAD_ACCIDENT: 'car-sport', FLOOD: 'water',
  NATURAL_DISASTER: 'thunderstorm', RESCUE: 'hand-left', FIRE: 'flame', INDUSTRIAL: 'warning',
  DEBRIS: 'layers', OTHER: 'alert-circle',
};

const TYPE_COLORS: Record<string, string> = {
  MEDICAL: '#DC2626', ROAD_ACCIDENT: '#EA580C', FLOOD: '#2563EB',
  NATURAL_DISASTER: '#0E7490', RESCUE: '#7C3AED', FIRE: '#EA580C', INDUSTRIAL: '#D97706',
  DEBRIS: '#6B7280', OTHER: '#0D6053',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', SUBMITTED: 'Submitted', RECEIVED: 'Received',
  ACKNOWLEDGED: 'Acknowledged', ASSESSED: 'Assessed',
  DISPATCH_PENDING: 'Dispatching', DISPATCHED: 'Dispatched',
  EN_ROUTE: 'En Route', ON_SCENE: 'On Scene',
  TRANSPORTING: 'Transporting', ASSISTING: 'Assisting',
  RESOLVED: 'Resolved', CLOSED: 'Closed',
  CANCELLED: 'Cancelled', FALSE_ALERT: 'False Alert',
  DUPLICATE: 'Duplicate', UNABLE_TO_RESPOND: 'Unable to Respond',
  REFERRED: 'Referred',
};

const TIMELINE_ICONS: Record<string, IoniconName> = {
  DRAFT: 'document-outline', SUBMITTED: 'document-text-outline',
  RECEIVED: 'document-text', ACKNOWLEDGED: 'business-outline',
  ASSESSED: 'clipboard-outline', DISPATCH_PENDING: 'time-outline',
  DISPATCHED: 'car-outline', EN_ROUTE: 'navigate',
  ON_SCENE: 'location', TRANSPORTING: 'medkit',
  ASSISTING: 'hand-left', RESOLVED: 'flag',
  CLOSED: 'checkmark-circle', CANCELLED: 'close-circle',
  FALSE_ALERT: 'alert-circle', DUPLICATE: 'copy-outline',
  UNABLE_TO_RESPOND: 'close-circle-outline', REFERRED: 'arrow-forward-circle',
};

const NOTIF_ICONS: Record<string, IoniconName> = {
  SMS: 'chatbubble-ellipses-outline', PUSH: 'phone-portrait-outline',
  EMAIL: 'mail-outline', IN_APP: 'phone-portrait-outline', SYSTEM: 'notifications-outline',
};

const ACTIVE_STATUSES = new Set([
  'DRAFT', 'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED',
  'DISPATCH_PENDING', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE',
  'TRANSPORTING', 'ASSISTING',
]);

const TERMINAL_POSITIVE = new Set(['RESOLVED', 'CLOSED', 'REFERRED']);
const TERMINAL_NEGATIVE = new Set(['CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND']);
const DELIVERED = new Set(['SENT', 'DELIVERED']);

// Text shades with at least 4.5:1 contrast. The shared textSub (#8795A3) is ~3.2:1 on
// white, too light for small text; icons keep the shared colours.
const SUB        = '#5E7185';
const GREEN_TEXT = '#15803D';
const RED_TEXT   = '#B91C1C';
const AMBER_TEXT = '#A35500';

/** Pads small controls to a 44 × 44 pt touch area without changing how they look. */
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    hour: '2-digit', minute: '2-digit',
  });
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeStyle(status: string): { bg: string; fg: string; icon: IoniconName } {
  if (TERMINAL_POSITIVE.has(status)) return { bg: '#DCFCE7', fg: GREEN_TEXT, icon: 'checkmark-circle' };
  if (TERMINAL_NEGATIVE.has(status)) return { bg: '#FEF2F2', fg: RED_TEXT, icon: 'close-circle' };
  return { bg: colors.primarySoft, fg: colors.primary, icon: 'radio-button-on' };
}

function timelineColor(status: string): string {
  if (TERMINAL_POSITIVE.has(status)) return '#16A34A';
  if (TERMINAL_NEGATIVE.has(status)) return '#DC2626';
  return colors.primary;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HistoryIncidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const token   = useAuthStore((s) => s.accessToken);
  const { isOnline } = useNetworkStatus();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const { data, isLoading, isError, refetch } = useQuery<IncidentHistoryDetail>({
    queryKey: ['incident-detail', id],
    queryFn:  () => getIncidentHistoryDetail(id!, token!),
    enabled:  !!id && !!token,
    staleTime: 30_000,
  });

  function handleBack() {
    router.replace('/history');
  }

  async function handleShare() {
    if (!data) return;
    try {
      await Share.share({
        title: `AGAP Incident ${data.reference}`,
        message: [
          `Incident Report: ${data.reference}`,
          `Type: ${TYPE_LABELS[data.type] ?? data.type}`,
          `Status: ${STATUS_LABELS[data.status] ?? data.status}`,
          `Reported: ${formatDate(data.reportedAt)}`,
          data.location?.address ? `Location: ${data.location.address}` : null,
        ].filter(Boolean).join('\n'),
      });
    } catch { /* cancelled */ }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
          <ActivityIndicator size="large" color={colors.primary} />
        </SafeAreaView>
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────

  if (isError || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.appBar}>
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
            <Text style={styles.errorTitle}>Could not load incident</Text>
            <Text style={styles.errorSub}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} activeOpacity={0.85} accessibilityRole="button">
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const typeColor  = TYPE_COLORS[data.type]      ?? colors.primary;
  const typeIcon   = TYPE_ICONS[data.type]        ?? 'alert-circle';
  const typeLabel  = TYPE_LABELS[data.type]       ?? data.type;
  const typeLabelS = TYPE_LABELS_SHORT[data.type] ?? data.type;
  const badge      = statusBadgeStyle(data.status);
  const statusLabel = STATUS_LABELS[data.status] ?? data.status;
  const isActive   = ACTIVE_STATUSES.has(data.status);

  const locationShort =
    [data.location?.barangay, data.location?.municipality].filter(Boolean).join(', ') ||
    data.location?.address ||
    'Location not recorded';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      <SafeAreaView style={{ backgroundColor: colors.white }} edges={['top']}>

        {/* ── App bar ────────────────────────────────────────────────────────── */}
        <View style={styles.appBar}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Text style={styles.brandIconText}>A</Text>
            </View>
            <View>
              <Text style={styles.brandName}>AGAP</Text>
              <Text style={styles.brandTagline} numberOfLines={1}>Incident Management Platform</Text>
            </View>
          </View>

          <View style={styles.appBarRight}>
            <View style={styles.onlineChip}>
              <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#4ADE80' : '#9CA3AF' }]} />
              <Text style={[styles.onlineText, { color: isOnline ? GREEN_TEXT : SUB }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => router.push('/notifications' as any)}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Page header ────────────────────────────────────────────────────── */}
        <View style={styles.pageHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Incident Details</Text>
            <Text style={styles.pageSubtitle}>Complete information about this incident.</Text>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} hitSlop={HIT_SLOP} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Share report">
            <Ionicons name="share-social-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.shareBtnText}>Share Report</Text>
          </TouchableOpacity>
        </View>

        {/* ── Incident summary card ──────────────────────────────────────────── */}
        <View style={styles.incidentCard}>
          <View style={styles.incidentCardLeft}>
            <View style={[styles.typeCircle, { backgroundColor: `${typeColor}15` }]}>
              <Ionicons name={typeIcon} size={22} color={typeColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.incidentTitle} numberOfLines={1}>{typeLabel}</Text>
              <Text style={styles.incidentRef}>{data.reference}</Text>
              <View style={styles.incidentMeta}>
                <Ionicons name="calendar-outline" size={11} color={colors.textSub} style={{ marginRight: 4 }} />
                <Text style={styles.incidentMetaText}>{formatDate(data.reportedAt)}</Text>
              </View>
              <View style={styles.incidentMeta}>
                <Ionicons name="location-outline" size={11} color={colors.textSub} style={{ marginRight: 4 }} />
                <Text style={styles.incidentMetaText} numberOfLines={1}>{locationShort}</Text>
              </View>
            </View>
          </View>

          <View style={styles.incidentCardRight}>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Ionicons name={badge.icon} size={13} color={badge.fg} style={{ marginRight: 4 }} />
              <Text style={[styles.statusBadgeText, { color: badge.fg }]}>{statusLabel}</Text>
            </View>
            <View style={styles.typeChip}>
              <Text style={styles.typeChipLabel}>Incident Type</Text>
              <Text style={styles.typeChipValue}>{typeLabelS}</Text>
            </View>
          </View>
        </View>

        {/* ── Tab bar ────────────────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
          accessibilityRole="tablist"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.75}
                hitSlop={{ top: 4, bottom: 4 }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

      </SafeAreaView>

      {/* ── Scrollable body ───────────────────────────────────────────────────── */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* Track Transmission — active incidents only */}
        {isActive && (
          <View style={styles.trackWrap}>
            <TouchableOpacity
              style={styles.trackBtn}
              onPress={() => router.push(`/tracking/${id}` as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Track live incident transmission"
            >
              <View style={styles.trackLeft}>
                <View style={styles.trackIconCircle}>
                  <Ionicons name="navigate" size={17} color={colors.white} />
                </View>
                <View>
                  <Text style={styles.trackTitle}>Track Transmission</Text>
                  <Text style={styles.trackSub}>Live responder location & ETA estimate</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'overview' && (
          <OverviewTab
            data={data}
            onViewTimeline={() => setActiveTab('timeline')}
            onViewNotifications={() => setActiveTab('notifications')}
          />
        )}
        {activeTab === 'timeline'      && <TimelineTab      data={data} />}
        {activeTab === 'notifications' && <NotificationsTab data={data} />}
        {activeTab === 'location'      && <LocationTab      data={data} />}
        {activeTab === 'resolution'    && <ResolutionTab    data={data} />}

      </ScrollView>
    </View>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  data,
  onViewTimeline,
  onViewNotifications,
}: {
  data: IncidentHistoryDetail;
  onViewTimeline: () => void;
  onViewNotifications: () => void;
}) {
  const reporterName = data.reporter.name ?? (data.reporter.isGuest ? 'Guest reporter' : 'You');
  const address =
    data.location?.address ??
    [data.location?.street, data.location?.barangay, data.location?.municipality]
      .filter(Boolean).join(', ') ??
    '—';

  return (
    <View style={styles.tabContent}>

      {/* Incident overview */}
      <SectionCard title="Incident Overview">
        {data.description ? (
          <View style={styles.descBox}>
            <Text style={styles.descText}>{data.description}</Text>
          </View>
        ) : (
          <Text style={styles.emptyNote}>No description was provided.</Text>
        )}

        <View style={styles.infoGrid}>
          <InfoRow icon="calendar-outline" label="Date & Time"      value={formatDate(data.reportedAt)} />
          <InfoRow icon="location-outline"  label="Exact Location"  value={address} />
          <InfoRow icon="person-outline"    label="Reported By"     value={reporterName} />
          <InfoRow
            icon="people-outline"
            label="People Involved"
            value={data.numberOfPatients != null ? `${data.numberOfPatients} person(s)` : '—'}
          />
          <InfoRow
            icon="document-text-outline"
            label="Reference Source"
            value={data.reporter.isGuest ? 'Guest Report' : 'Mobile App (Citizen Report)'}
          />
        </View>
      </SectionCard>

      {/* Abbreviated timeline */}
      {data.timeline.length > 0 && (
        <SectionCard
          title="Incident Timeline"
          action={
            <TouchableOpacity onPress={onViewTimeline} style={styles.linkBtn} hitSlop={HIT_SLOP} accessibilityRole="button">
              <Text style={styles.viewAllLink}>View All</Text>
            </TouchableOpacity>
          }
        >
          {data.timeline.slice(-4).map((entry, i, arr) => (
            <TimelineRow key={`${entry.status}-${i}`} entry={entry} isLast={i === arr.length - 1} />
          ))}
        </SectionCard>
      )}

      {/* Location + Resolution side by side */}
      <View style={styles.splitRow}>
        <LocationMiniCard data={data} />
        <ResolutionMiniCard data={data} />
      </View>

      {/* Abbreviated notifications */}
      {data.notifications.length > 0 && (
        <SectionCard
          title="Notifications Sent"
          action={
            <TouchableOpacity onPress={onViewNotifications} style={styles.linkBtn} hitSlop={HIT_SLOP} accessibilityRole="button">
              <Text style={styles.viewAllLink}>View All</Text>
            </TouchableOpacity>
          }
        >
          {data.notifications.slice(0, 3).map((n, i, arr) => (
            <NotifRow key={i} notif={n} isLast={i === arr.length - 1} />
          ))}
        </SectionCard>
      )}

      {/* 911 reminder */}
      <View style={styles.hotlineCard}>
        <Ionicons name="call-outline" size={16} color={colors.textSub} style={{ marginRight: 10, marginTop: 2 }} />
        <Text style={styles.hotlineText}>
          AGAP complements — never replaces —{' '}
          <Text style={styles.hotlineNum}>911</Text> and the{' '}
          <Text style={styles.hotlineNum}>MDRRMO hotline</Text>.
        </Text>
      </View>

    </View>
  );
}

// ─── Timeline tab ─────────────────────────────────────────────────────────────

function TimelineTab({ data }: { data: IncidentHistoryDetail }) {
  return (
    <View style={styles.tabContent}>
      <SectionCard title={`Status Timeline · ${data.timeline.length} event${data.timeline.length !== 1 ? 's' : ''}`}>
        {data.timeline.length === 0 ? (
          <Text style={styles.emptyNote}>No timeline events yet.</Text>
        ) : (
          data.timeline.map((entry, i) => (
            <TimelineRow key={`${entry.status}-${i}`} entry={entry} isLast={i === data.timeline.length - 1} />
          ))
        )}
      </SectionCard>
    </View>
  );
}

// ─── Notifications tab ────────────────────────────────────────────────────────

function NotificationsTab({ data }: { data: IncidentHistoryDetail }) {
  return (
    <View style={styles.tabContent}>
      <SectionCard title={`Notifications Sent · ${data.notifications.length}`}>
        {data.notifications.length === 0 ? (
          <Text style={styles.emptyNote}>No notifications were sent for this incident.</Text>
        ) : (
          data.notifications.map((n, i) => (
            <NotifRow key={i} notif={n} isLast={i === data.notifications.length - 1} />
          ))
        )}
      </SectionCard>
    </View>
  );
}

// ─── Location tab ─────────────────────────────────────────────────────────────

function LocationTab({ data }: { data: IncidentHistoryDetail }) {
  const loc = data.location;
  const address =
    loc?.address ??
    [loc?.street, loc?.barangay, loc?.municipality, loc?.province].filter(Boolean).join(', ') ??
    null;
  const hasCoords = loc?.lat != null && loc?.lng != null;

  function openMap() {
    if (hasCoords) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${loc!.lat},${loc!.lng}`);
    }
  }

  return (
    <View style={styles.tabContent}>
      <SectionCard title="Incident Location">
        {!loc ? (
          <View style={styles.emptyCenter}>
            <Ionicons name="location-outline" size={32} color={colors.textSub} />
            <Text style={[styles.emptyNote, { marginTop: 8, textAlign: 'center' }]}>
              No location was captured for this incident.
            </Text>
          </View>
        ) : (
          <>
            {/* Placeholder map tile */}
            <View style={styles.mapTile}>
              <Ionicons name="map-outline" size={28} color={colors.textSub} />
              <Text style={styles.mapTileText}>
                {hasCoords ? `${loc!.lat!.toFixed(5)}, ${loc!.lng!.toFixed(5)}` : 'Coordinates unavailable'}
              </Text>
            </View>

            {address && (
              <View style={styles.locRow}>
                <View style={styles.locIconCircle}>
                  <Ionicons name="location" size={16} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.locAddress}>{address}</Text>
                  {loc?.municipality && (
                    <Text style={styles.locSub}>
                      {[loc.municipality, loc.province].filter(Boolean).join(', ')}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {hasCoords && (
              <TouchableOpacity style={styles.mapBtn} onPress={openMap} activeOpacity={0.85} accessibilityRole="button">
                <Ionicons name="map-outline" size={15} color={colors.primary} style={{ marginRight: 7 }} />
                <Text style={styles.mapBtnText}>View on Map</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </SectionCard>
    </View>
  );
}

// ─── Resolution tab ───────────────────────────────────────────────────────────

function ResolutionTab({ data }: { data: IncidentHistoryDetail }) {
  const r = data.resolution;
  const isTerminalNeg = TERMINAL_NEGATIVE.has(data.status);

  if (!r) {
    return (
      <View style={styles.tabContent}>
        <SectionCard title="Resolution">
          {isTerminalNeg ? (
            <View style={styles.emptyCenter}>
              <View style={[styles.resStatusIcon, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="close-circle" size={22} color={colors.danger} />
              </View>
              <Text style={[styles.resOutcomeText, { color: colors.danger, marginTop: 10 }]}>
                {STATUS_LABELS[data.status] ?? data.status}
              </Text>
              <Text style={[styles.emptyNote, { marginTop: 6, textAlign: 'center' }]}>
                This incident was marked as {(STATUS_LABELS[data.status] ?? data.status).toLowerCase()}.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyCenter}>
              <Ionicons name="time-outline" size={32} color={colors.textSub} />
              <Text style={[styles.emptyNote, { marginTop: 8, textAlign: 'center' }]}>
                This incident is still active. Resolution will appear here once it is closed.
              </Text>
            </View>
          )}
        </SectionCard>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <SectionCard title="Resolution">
        <View style={styles.resHeadRow}>
          <View style={[styles.resStatusIcon, { backgroundColor: '#DCFCE7' }]}>
            <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
          </View>
          <Text style={styles.resOutcomeText}>{r.outcome?.replace(/_/g, ' ') ?? 'Resolved'}</Text>
        </View>

        {r.notes ? (
          <View style={styles.descBox}>
            <Text style={styles.descText}>{r.notes}</Text>
          </View>
        ) : null}

        <View style={styles.infoGrid}>
          {r.disposition && (
            <InfoRow icon="walk-outline" label="Patient Disposition" value={titleCase(r.disposition)} />
          )}
          <InfoRow icon="person-outline" label="Resolved By" value="MDRRMO Operations Center" />
          <InfoRow icon="calendar-outline" label="Resolved At" value={formatDate(r.closedAt)} />
          <InfoRow icon="refresh-outline" label="Follow-up Required" value={r.followUpRequired ? 'Yes' : 'No'} />
        </View>

        {r.followUpRequired && (
          <View style={styles.followUpBanner}>
            <Ionicons name="alert-circle" size={16} color={AMBER_TEXT} style={{ marginRight: 8 }} />
            <Text style={styles.followUpText}>Follow-up action required</Text>
          </View>
        )}
      </SectionCard>
    </View>
  );
}

// ─── Mini cards for overview split row ───────────────────────────────────────

function LocationMiniCard({ data }: { data: IncidentHistoryDetail }) {
  const loc = data.location;
  const address =
    loc?.address ??
    [loc?.barangay, loc?.municipality].filter(Boolean).join(', ') ??
    'Not recorded';
  const hasCoords = loc?.lat != null && loc?.lng != null;

  function openMap() {
    if (hasCoords) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${loc!.lat},${loc!.lng}`);
    }
  }

  return (
    <View style={styles.miniCard}>
      <View style={styles.miniCardHeader}>
        <Ionicons name="location-outline" size={13} color={colors.primary} style={{ marginRight: 5 }} />
        <Text style={styles.miniCardTitle}>Location</Text>
        {hasCoords && (
          <TouchableOpacity onPress={openMap} style={styles.miniHeaderLink} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Open map">
            <Text style={styles.viewAllLink}>Map</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.miniMapPlaceholder}>
        <Ionicons name="map-outline" size={20} color={colors.textSub} />
      </View>
      <Text style={styles.miniLocText} numberOfLines={2}>{address}</Text>
      {hasCoords && (
        <TouchableOpacity style={styles.miniMapBtn} onPress={openMap} activeOpacity={0.8} accessibilityRole="button">
          <Ionicons name="open-outline" size={14} color={colors.primary} style={{ marginRight: 5 }} />
          <Text style={styles.miniMapBtnText}>View on Map</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ResolutionMiniCard({ data }: { data: IncidentHistoryDetail }) {
  const r = data.resolution;
  const isPos = TERMINAL_POSITIVE.has(data.status);
  const isNeg = TERMINAL_NEGATIVE.has(data.status);

  const iconName: IoniconName = isPos ? 'checkmark-circle' : isNeg ? 'close-circle' : 'time-outline';
  const iconColor = isPos ? '#16A34A' : isNeg ? colors.danger : colors.textSub;
  const iconBg    = isPos ? '#DCFCE7' : isNeg ? '#FEF2F2' : colors.surface;

  return (
    <View style={styles.miniCard}>
      <View style={styles.miniCardHeader}>
        <Ionicons name="flag-outline" size={13} color={colors.primary} style={{ marginRight: 5 }} />
        <Text style={styles.miniCardTitle}>Resolution</Text>
      </View>

      <View style={styles.miniResIconWrap}>
        <View style={[styles.miniResIconCircle, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={22} color={iconColor} />
        </View>
      </View>

      {r ? (
        <>
          <Text style={styles.miniResOutcome} numberOfLines={2}>
            {r.outcome?.replace(/_/g, ' ') ?? 'Resolved'}
          </Text>
          {r.notes ? (
            <Text style={styles.miniResNotes} numberOfLines={2}>{r.notes}</Text>
          ) : null}
          <Text style={styles.miniResDate}>{formatDate(r.closedAt)}</Text>
        </>
      ) : (
        <Text style={styles.miniResNotes}>
          {ACTIVE_STATUSES.has(data.status) ? 'Incident still active' : 'No resolution recorded'}
        </Text>
      )}
    </View>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: IoniconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon} size={14} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function TimelineRow({
  entry,
  isLast,
}: {
  entry: IncidentTimelineEntry;
  isLast: boolean;
}) {
  const color  = timelineColor(entry.status);
  const icon   = TIMELINE_ICONS[entry.status] ?? 'ellipse-outline';
  const label  = STATUS_LABELS[entry.status]  ?? entry.status;

  return (
    <View style={styles.tlRow}>
      <View style={styles.tlLeft}>
        <View style={[styles.tlDot, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
          <Ionicons name={icon} size={12} color={color} />
        </View>
        {!isLast && <View style={[styles.tlLine, { backgroundColor: `${color}25` }]} />}
      </View>
      <View style={styles.tlBody}>
        <View style={styles.tlHeadRow}>
          <Text style={styles.tlLabel}>{label}</Text>
          <Text style={styles.tlTime}>{formatTime(entry.at)}</Text>
        </View>
        {entry.notes ? <Text style={styles.tlNote}>{entry.notes}</Text> : null}
        <Text style={styles.tlDate}>{formatDate(entry.at)}</Text>
      </View>
    </View>
  );
}

function NotifRow({
  notif,
  isLast,
}: {
  notif: IncidentNotificationEntry;
  isLast: boolean;
}) {
  const icon    = NOTIF_ICONS[notif.channel?.toUpperCase()] ?? 'notifications-outline';
  const sent    = DELIVERED.has(notif.status?.toUpperCase());
  const failed  = notif.status?.toUpperCase() === 'FAILED';
  const tintFg  = sent ? GREEN_TEXT : failed ? RED_TEXT : AMBER_TEXT;
  const tintBg  = sent ? '#DCFCE7' : failed ? '#FEF2F2' : '#FFFBEB';
  const checkIcon: IoniconName = sent ? 'checkmark-circle' : failed ? 'close-circle' : 'time-outline';

  return (
    <View style={[styles.notifRow, !isLast && styles.notifBorder]}>
      <View style={styles.notifIconWrap}>
        <Ionicons name={icon} size={15} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
        <Text style={styles.notifMeta}>
          {titleCase(notif.channel)}{notif.sentAt ? ` · ${formatTime(notif.sentAt)}` : ''}
        </Text>
      </View>
      <View style={[styles.notifBadge, { backgroundColor: tintBg }]}>
        <Ionicons name={checkIcon} size={12} color={tintFg} style={{ marginRight: 4 }} />
        <Text style={[styles.notifBadgeText, { color: tintFg }]}>
          {sent ? 'Sent' : titleCase(notif.status)}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  // ── App bar ─────────────────────────────────────────────────────────────────
  appBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, minHeight: 56,
    backgroundColor: colors.white, gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  brandRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#1A2B4A',
    alignItems: 'center', justifyContent: 'center',
  },
  brandIconText: { color: colors.white, fontWeight: '900', fontSize: 15 },
  brandName:     { fontSize: 13, fontWeight: '800', color: '#1A2B4A' },
  brandTagline:  { fontSize: 11, color: SUB, fontWeight: '500' },
  appBarRight:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.bg, borderRadius: 20,
    paddingHorizontal: 10, minHeight: 28,
  },
  onlineDot:   { width: 8, height: 8, borderRadius: 4 },
  onlineText:  { fontSize: 12, fontWeight: '700' },
  bellBtn:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  // ── Page header ─────────────────────────────────────────────────────────────
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12,
    backgroundColor: colors.white,
  },
  pageTitle:    { fontSize: 24, fontWeight: '800', color: '#1A2B4A', lineHeight: 30 },
  pageSubtitle: { fontSize: 13, color: SUB, marginTop: 2, lineHeight: 18 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, minHeight: 36,
    borderRadius: 18,
    borderWidth: 1, borderColor: `${colors.primary}28`,
    backgroundColor: colors.primarySoft,
  },
  shareBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  // ── Incident summary card ────────────────────────────────────────────────────
  incidentCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 12,
    padding: 16, backgroundColor: colors.white,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    ...cardShadow,
  },
  incidentCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginRight: 10 },
  typeCircle: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  incidentTitle:    { fontSize: 16, fontWeight: '800', color: '#1A2B4A', lineHeight: 22, marginBottom: 2 },
  incidentRef:      { fontSize: 12, fontWeight: '700', color: colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 6 },
  incidentMeta:     { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  incidentMetaText: { fontSize: 12, color: SUB, flex: 1, lineHeight: 16 },
  incidentCardRight:{ alignItems: 'flex-end', gap: 8, flexShrink: 0, paddingTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, minHeight: 26, borderRadius: 13,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  typeChip: {
    alignItems: 'flex-end', backgroundColor: colors.bg,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6,
  },
  typeChipLabel: { fontSize: 11, color: SUB, fontWeight: '600' },
  typeChipValue: { fontSize: 13, fontWeight: '700', color: '#1A2B4A', marginTop: 1 },

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  tabBar: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab: {
    paddingHorizontal: 16, minHeight: 38, justifyContent: 'center',
    borderRadius: 19, backgroundColor: colors.bg,
  },
  tabActive:     { backgroundColor: '#1A2B4A' },
  tabText:       { fontSize: 14, fontWeight: '600', color: colors.textMid },
  tabTextActive: { color: colors.white, fontWeight: '700' },

  // ── Track Transmission banner ─────────────────────────────────────────────────
  trackWrap: { paddingHorizontal: 16, paddingTop: 16 },
  trackBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A2B4A', borderRadius: radius.lg,
    paddingVertical: 14, paddingHorizontal: 16, minHeight: 64,
    ...cardShadow, shadowColor: '#1A2B4A', shadowOpacity: 0.2,
  },
  trackLeft:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  trackIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  trackTitle: { fontSize: 15, fontWeight: '700', color: colors.white },
  trackSub:   { fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 2 },

  // ── Tab content ──────────────────────────────────────────────────────────────
  tabContent: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  // ── Section card ─────────────────────────────────────────────────────────────
  sectionCard: {
    backgroundColor: colors.white, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, ...cardShadow,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A2B4A', flex: 1 },
  linkBtn:      { minHeight: 32, paddingHorizontal: 4, justifyContent: 'center' },
  viewAllLink:  { fontSize: 13, fontWeight: '700', color: colors.primary },

  // ── Description box ──────────────────────────────────────────────────────────
  descBox: {
    backgroundColor: colors.bg, borderRadius: radius.md,
    padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  descText:  { fontSize: 14, color: colors.textMid, lineHeight: 21 },
  emptyNote: { fontSize: 14, color: SUB, fontStyle: 'italic', lineHeight: 20 },
  emptyCenter: { alignItems: 'center', paddingVertical: 20, gap: 4 },

  // ── Info grid ────────────────────────────────────────────────────────────────
  infoGrid: { gap: 14 },
  infoRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  infoLabel: { fontSize: 12, color: SUB, fontWeight: '600', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#1A2B4A', fontWeight: '600', lineHeight: 20 },

  // ── Timeline rows ─────────────────────────────────────────────────────────────
  tlRow:   { flexDirection: 'row', alignItems: 'flex-start', minHeight: 48 },
  tlLeft:  { width: 30, alignItems: 'center' },
  tlDot: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  tlLine:    { flex: 1, width: 2, marginTop: 2, borderRadius: 1 },
  tlBody:    { flex: 1, paddingLeft: 12, paddingBottom: 16, paddingTop: 3 },
  tlHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tlLabel:   { flex: 1, fontSize: 14, fontWeight: '700', color: '#1A2B4A', lineHeight: 20 },
  tlTime:    { fontSize: 13, fontWeight: '600', color: SUB, marginLeft: 8 },
  tlNote:    { marginTop: 2, fontSize: 13, lineHeight: 18, color: SUB },
  tlDate:    { marginTop: 2, fontSize: 12, color: SUB },

  // ── Notification rows ────────────────────────────────────────────────────────
  notifRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: 60 },
  notifBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  notifIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginRight: 11,
  },
  notifTitle:     { fontSize: 14, fontWeight: '700', color: '#1A2B4A', lineHeight: 20 },
  notifMeta:      { fontSize: 12, color: SUB, marginTop: 2 },
  notifBadge:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, minHeight: 26, borderRadius: 13, marginLeft: 8 },
  notifBadgeText: { fontSize: 12, fontWeight: '700' },

  // ── Split row ────────────────────────────────────────────────────────────────
  splitRow: { flexDirection: 'row', gap: 12 },

  // ── Mini cards ───────────────────────────────────────────────────────────────
  miniCard: {
    flex: 1,
    backgroundColor: colors.white, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: 14, ...cardShadow,
  },
  miniCardHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 24, marginBottom: 10 },
  miniCardTitle:  { fontSize: 14, fontWeight: '800', color: '#1A2B4A' },
  miniHeaderLink: { marginLeft: 'auto', paddingHorizontal: 4, minHeight: 24, justifyContent: 'center' },

  miniMapPlaceholder: {
    height: 72, borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  miniLocText: { fontSize: 13, fontWeight: '600', color: '#1A2B4A', lineHeight: 18, marginBottom: 10 },
  miniMapBtn: {
    marginTop: 'auto',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 40, borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1, borderColor: `${colors.primary}22`,
  },
  miniMapBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  miniResIconWrap:   { alignItems: 'center', marginBottom: 10 },
  miniResIconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  miniResOutcome:    { fontSize: 13, fontWeight: '700', color: '#1A2B4A', textAlign: 'center', marginBottom: 4, lineHeight: 18 },
  miniResNotes:      { fontSize: 12, color: SUB, lineHeight: 17, textAlign: 'center' },
  miniResDate:       { fontSize: 12, color: SUB, marginTop: 6, textAlign: 'center' },

  // ── Location tab ──────────────────────────────────────────────────────────────
  mapTile: {
    height: 150, borderRadius: radius.md,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14, gap: 6,
  },
  mapTileText: { fontSize: 12, color: SUB, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  locRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  locIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  locAddress: { fontSize: 15, fontWeight: '700', color: '#1A2B4A', lineHeight: 21 },
  locSub:     { fontSize: 13, color: SUB, marginTop: 2 },
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 48, borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1, borderColor: `${colors.primary}22`,
  },
  mapBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  // ── Resolution tab ────────────────────────────────────────────────────────────
  resHeadRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  resStatusIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  resOutcomeText:{ flex: 1, fontSize: 15, fontWeight: '800', color: '#1A2B4A' },
  followUpBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 14, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
  followUpText: { flex: 1, fontSize: 14, fontWeight: '700', color: AMBER_TEXT },

  // ── Hotline ───────────────────────────────────────────────────────────────────
  hotlineCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 14, borderRadius: radius.lg,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  hotlineText: { flex: 1, fontSize: 13, lineHeight: 20, color: SUB },
  hotlineNum:  { fontWeight: '700', color: colors.textMid },

  // ── Error state ───────────────────────────────────────────────────────────────
  errorTitle: { fontSize: 17, fontWeight: '800', color: '#1A2B4A', marginTop: 14, marginBottom: 6, textAlign: 'center' },
  errorSub:   { fontSize: 14, color: SUB, textAlign: 'center', marginBottom: 24, lineHeight: 21 },
  retryBtn:   { minHeight: 48, minWidth: 160, paddingHorizontal: 28, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  retryText:  { fontSize: 15, fontWeight: '700', color: colors.white },
});
