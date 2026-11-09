import React, { Component, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
  RefreshControl,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '../../src/stores/auth.store';
import { useIncidentStore } from '../../src/stores/incident.store';
import { ApiError } from '../../src/services/api/http';
import {
  getIncidentHistoryDetail,
  type IncidentHistoryDetail,
  type IncidentTimelineEntry,
  type IncidentNotificationEntry,
} from '../../src/services/api/incidents.api';
import { getMapConfig } from '../../src/services/api/locations.api';
import { useIncidentTracking } from '../../src/hooks/useIncidentTracking';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { isNativeMapAvailable } from '../../src/components/tracking/native-map-available';
import { ReporterThanksCard } from '../../src/components/reporter/verified-reporter';

const CitizenLocationMap = React.lazy(
  () => Promise.resolve({
    default: require('../../src/components/tracking/citizen-location-map').default as typeof import('../../src/components/tracking/citizen-location-map').default,
  }),
);

// Keyless OpenFreeMap fallback — real OSM streets at municipal zoom (the old
// maplibre.org demo tiles were blank at Bocaue). Used only when the backend
// map-config returns no styleUrl.
const MAPLIBRE_DEMO_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'timeline' | 'notifications' | 'location' | 'resolution';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview',      label: 'Overview'       },
  { key: 'timeline',      label: 'Timeline'       },
  { key: 'notifications', label: 'Notifications'  },
  { key: 'location',      label: 'Location'       },
  { key: 'resolution',    label: 'Resolution'     },
];

// ─── Display maps ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  MEDICAL: 'Medical', ROAD_ACCIDENT: 'Road Traffic', FLOOD: 'Flood',
  NATURAL_DISASTER: 'Natural Disaster', RESCUE: 'Search & Rescue', FIRE: 'Fire', INDUSTRIAL: 'Industrial',
  DEBRIS: 'Debris', OTHER: 'Other',
};

const TYPE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
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

const TIMELINE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  DRAFT: 'document-outline',
  SUBMITTED: 'document-text-outline',
  RECEIVED: 'document-text',
  ACKNOWLEDGED: 'business-outline',
  ASSESSED: 'clipboard-outline',
  DISPATCH_PENDING: 'time-outline',
  DISPATCHED: 'car-outline',
  EN_ROUTE: 'navigate',
  ON_SCENE: 'location',
  TRANSPORTING: 'medkit',
  ASSISTING: 'hand-left',
  RESOLVED: 'flag',
  CLOSED: 'checkmark-circle',
  CANCELLED: 'close-circle',
  FALSE_ALERT: 'alert-circle',
  DUPLICATE: 'copy-outline',
  UNABLE_TO_RESPOND: 'close-circle-outline',
  REFERRED: 'arrow-forward-circle',
};

const CITIZEN_STEPS = [
  { key: 'SUBMITTED',    label: 'Submitted'    },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'DISPATCHED',   label: 'Dispatched'   },
  { key: 'EN_ROUTE',     label: 'En Route'     },
  { key: 'ON_SCENE',     label: 'On Scene'     },
] as const;

const STEP_INDEX: Record<string, number> = {
  SUBMITTED: 0, RECEIVED: 0,
  ACKNOWLEDGED: 1, ASSESSED: 1,
  DISPATCH_PENDING: 2, DISPATCHED: 2,
  EN_ROUTE: 3,
  ON_SCENE: 4, TRANSPORTING: 4, ASSISTING: 4, RESOLVED: 4,
};

const ACTIVE_STATUSES = new Set([
  'DRAFT', 'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED',
  'DISPATCH_PENDING', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE',
  'TRANSPORTING', 'ASSISTING',
]);

const CANCELLABLE_STATUSES = new Set([
  'DRAFT', 'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING',
]);

const TERMINAL_POSITIVE = new Set(['RESOLVED', 'CLOSED', 'REFERRED']);
const TERMINAL_NEGATIVE = new Set(['CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND']);

const NOTIF_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  SMS: 'chatbubble-ellipses-outline',
  PUSH: 'phone-portrait-outline',
  EMAIL: 'mail-outline',
  SYSTEM: 'notifications-outline',
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:          '#F4F6F9',
  white:       '#FFFFFF',
  navy:        '#1A2B4A',
  primary:     '#0D6053',
  primarySoft: '#EEF7F4',
  text:        '#1A2B4A',
  textMid:     '#374151',
  textSub:     '#6B7280',
  border:      '#E5E7EB',
  green:       '#16A34A',
  greenText:   '#15803D',
  greenSoft:   '#DCFCE7',
  red:         '#DC2626',
  redText:     '#B91C1C',
  redSoft:     '#FEF2F2',
  amber:       '#D97706',
  // Small amber text needs this darker shade for 4.5:1 contrast on amberSoft / white.
  amberText:   '#A35500',
  amberSoft:   '#FFFBEB',
};

/** Pads small controls to a 44 × 44 pt touch area without changing how they look. */
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

const SHADOW = {
  shadowColor: '#1A2B4A',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
  elevation: 3,
};

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

function statusBadge(status: string): { bg: string; text: string; icon?: React.ComponentProps<typeof Ionicons>['name'] } {
  if (TERMINAL_POSITIVE.has(status)) return { bg: C.greenSoft, text: C.greenText, icon: 'checkmark-circle' };
  if (TERMINAL_NEGATIVE.has(status)) return { bg: C.redSoft, text: C.redText, icon: 'close-circle' };
  if (ACTIVE_STATUSES.has(status))   return { bg: C.primarySoft, text: C.primary, icon: 'radio-button-on' };
  return { bg: '#F3F4F6', text: C.textSub };
}

function timelineIconColor(status: string): string {
  if (TERMINAL_POSITIVE.has(status)) return C.green;
  if (TERMINAL_NEGATIVE.has(status)) return C.red;
  return C.primary;
}

// ─── Map error boundary ───────────────────────────────────────────────────────

class MapErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <View style={styles.mapFallback}>
          <Ionicons name="map-outline" size={28} color={C.textSub} />
          <Text style={styles.mapFallbackText}>Map unavailable</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Section: Overview ────────────────────────────────────────────────────────

function OverviewTab({
  raw,
  live,
  onTrackPress,
}: {
  raw: IncidentHistoryDetail;
  live: ReturnType<typeof useIncidentTracking>;
  onTrackPress: () => void;
}) {
  const isActive = ACTIVE_STATUSES.has(raw.status);
  const stepIndex = TERMINAL_POSITIVE.has(raw.status) || TERMINAL_NEGATIVE.has(raw.status)
    ? CITIZEN_STEPS.length
    : (STEP_INDEX[raw.status] ?? -1);

  const location = raw.location;
  const address =
    location?.address ??
    [location?.street, location?.barangay, location?.municipality].filter(Boolean).join(', ') ??
    '—';

  const etaMins = live.etaSeconds != null ? Math.max(1, Math.ceil(live.etaSeconds / 60)) : null;

  return (
    <View style={styles.tabContent}>

      {/* Thank-you + Verified Reporter badge once the incident is closed */}
      {raw.status === 'CLOSED' && <ReporterThanksCard />}

      {/* Live tracking banner — active incidents only */}
      {isActive && (
        <TouchableOpacity
          style={styles.liveCard}
          activeOpacity={0.85}
          onPress={onTrackPress}
          accessibilityRole="button"
          accessibilityLabel="Track responder live on a map"
        >
          <View style={styles.liveCardLeft}>
            <View style={styles.liveIconWrap}>
              <Ionicons name="navigate" size={20} color={C.white} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.liveRow}>
                <View style={[styles.liveDot, { backgroundColor: live.connected ? '#4ADE80' : '#9CA3AF' }]} />
                <Text style={styles.liveLabel}>
                  {live.connected ? 'Live tracking active' : 'Live tracking'}
                </Text>
              </View>
              <Text style={styles.liveEta}>
                {etaMins != null
                  ? `Responder ~${etaMins} min away  (estimate)`
                  : live.responder
                  ? 'Responder location updated'
                  : 'Tap to open live map'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      )}

      {/* Progress track — active only */}
      {isActive && (
        <View
          style={styles.card}
          accessible
          accessibilityLabel={`Progress: ${CITIZEN_STEPS[Math.min(Math.max(stepIndex, 0), CITIZEN_STEPS.length - 1)]?.label ?? 'Submitted'}`}
        >
          {/* Each step is one equal column: the dot sits exactly above its label. */}
          <View style={styles.progressRow}>
            {CITIZEN_STEPS.map((step, i) => {
              const done    = i <= stepIndex;
              const current = i === stepIndex && isActive;
              const last    = i === CITIZEN_STEPS.length - 1;
              return (
                <View key={step.key} style={styles.pStep}>
                  <View style={styles.pTrack}>
                    <View style={[styles.pLine, i === 0 && styles.pLineHidden, done && styles.pLineDone]} />
                    <View style={[styles.pDot, done && styles.pDotDone, current && styles.pDotCurrent]} />
                    <View style={[styles.pLine, last && styles.pLineHidden, i < stepIndex && styles.pLineDone]} />
                  </View>
                  <Text
                    style={[styles.progressLabel, (done || current) && styles.progressLabelDone]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Incident overview card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Incident Overview</Text>
        </View>

        {raw.description ? (
          <View style={styles.descBox}>
            <Text style={styles.descText}>{raw.description}</Text>
          </View>
        ) : (
          <Text style={[styles.descText, { color: C.textSub, fontStyle: 'italic' }]}>
            No description provided.
          </Text>
        )}

        <View style={styles.infoGrid}>
          <InfoRow icon="calendar-outline" label="Date & Time"    value={formatDate(raw.reportedAt)} />
          <InfoRow icon="location-outline"  label="Exact Location" value={address} />
          <InfoRow icon="person-outline"    label="Reported By"    value={raw.reporter.name ?? (raw.reporter.isGuest ? 'Guest (no account)' : 'Anonymous')} />
          <InfoRow icon="people-outline"    label="People Involved" value={raw.numberOfPatients != null ? `${raw.numberOfPatients} person(s)` : '—'} />
          <InfoRow icon="document-text-outline" label="Reference Source" value={raw.reporter.isGuest ? 'Guest Report' : 'Mobile App (Citizen Report)'} />
        </View>
      </View>

      {/* Abbreviated timeline — last 4 entries */}
      {raw.timeline.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Incident Timeline</Text>
          </View>
          {raw.timeline.slice(-4).map((entry, i, arr) => (
            <TimelineRow
              key={`${entry.status}-${i}`}
              entry={entry}
              isLast={i === arr.length - 1}
            />
          ))}
        </View>
      )}

      {/* Emergency contact reminder */}
      <View style={styles.hotlineCard}>
        <Ionicons name="call-outline" size={16} color={C.textSub} style={styles.hotlineIcon} />
        <Text style={styles.hotlineText}>
          For immediate help, call <Text style={styles.hotlineNum}>911</Text> or the{' '}
          <Text style={styles.hotlineNum}>MDRRMO hotline</Text>.
        </Text>
      </View>
    </View>
  );
}

function InfoRow({
  icon, label, value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon} size={14} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Section: Timeline ────────────────────────────────────────────────────────

function TimelineRow({
  entry, isLast,
}: {
  entry: IncidentTimelineEntry;
  isLast: boolean;
}) {
  const color  = timelineIconColor(entry.status);
  const icon   = TIMELINE_ICONS[entry.status] ?? 'ellipse-outline';
  const label  = STATUS_LABELS[entry.status] ?? entry.status;

  return (
    <View style={styles.tlRow}>
      <View style={styles.tlLeft}>
        <View style={[styles.tlIconCircle, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
          <Ionicons name={icon} size={14} color={color} />
        </View>
        {!isLast && <View style={[styles.tlLine, { backgroundColor: `${color}30` }]} />}
      </View>
      <View style={styles.tlBody}>
        <View style={styles.tlTitleRow}>
          <Text style={styles.tlTitle}>{label}</Text>
          <Text style={styles.tlTime}>{formatTime(entry.at)}</Text>
        </View>
        {entry.notes ? (
          <Text style={styles.tlNote}>{entry.notes}</Text>
        ) : null}
        <Text style={styles.tlDate}>{formatDate(entry.at)}</Text>
      </View>
    </View>
  );
}

function TimelineTab({ raw }: { raw: IncidentHistoryDetail }) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Status Timeline</Text>
          <Text style={styles.cardSub}>{raw.timeline.length} event{raw.timeline.length !== 1 ? 's' : ''}</Text>
        </View>
        {raw.timeline.length === 0 ? (
          <Text style={styles.emptyText}>No timeline events yet.</Text>
        ) : (
          raw.timeline.map((entry, i) => (
            <TimelineRow
              key={`${entry.status}-${i}`}
              entry={entry}
              isLast={i === raw.timeline.length - 1}
            />
          ))
        )}
      </View>
    </View>
  );
}

// ─── Section: Notifications ───────────────────────────────────────────────────

function NotificationsTab({ raw }: { raw: IncidentHistoryDetail }) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Notifications Sent</Text>
          <Text style={styles.cardSub}>{raw.notifications.length} sent</Text>
        </View>
        {raw.notifications.length === 0 ? (
          <Text style={styles.emptyText}>No notifications sent yet.</Text>
        ) : (
          raw.notifications.map((n, i) => (
            <NotifRow key={i} notif={n} isLast={i === raw.notifications.length - 1} />
          ))
        )}
      </View>
    </View>
  );
}

function NotifRow({ notif, isLast }: { notif: IncidentNotificationEntry; isLast: boolean }) {
  const icon = NOTIF_ICONS[notif.channel.toUpperCase()] ?? 'notifications-outline';
  const sent = notif.status.toLowerCase() === 'sent' || notif.status.toLowerCase() === 'delivered';

  return (
    <View style={[styles.notifRow, !isLast && styles.notifBorder]}>
      <View style={styles.notifIconWrap}>
        <Ionicons name={icon} size={16} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.notifTitle}>{notif.title}</Text>
        <Text style={styles.notifChannel}>{notif.channel} · {notif.sentAt ? formatTime(notif.sentAt) : 'Pending'}</Text>
      </View>
      <View style={[styles.notifBadge, { backgroundColor: sent ? C.greenSoft : C.amberSoft }]}>
        <Ionicons
          name={sent ? 'checkmark-circle' : 'time-outline'}
          size={12}
          color={sent ? C.green : C.amberText}
          style={{ marginRight: 4 }}
        />
        <Text style={[styles.notifBadgeText, { color: sent ? C.greenText : C.amberText }]}>
          {sent ? 'Sent' : notif.status}
        </Text>
      </View>
    </View>
  );
}

// ─── Section: Location ────────────────────────────────────────────────────────

function LocationTab({
  raw,
  mapAvailable,
}: {
  raw: IncidentHistoryDetail;
  mapAvailable: boolean;
}) {
  const token = useAuthStore((s) => s.accessToken);

  const { data: mapConfig } = useQuery({
    queryKey: ['map-config'],
    queryFn: () => getMapConfig(token ?? undefined),
    enabled: mapAvailable,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const coords = raw.location?.lat != null && raw.location?.lng != null
    ? { lat: raw.location.lat, lng: raw.location.lng }
    : null;

  const styleUrl = mapConfig?.styleUrl ?? MAPLIBRE_DEMO_STYLE;

  const address =
    raw.location?.address ??
    [raw.location?.street, raw.location?.barangay, raw.location?.municipality].filter(Boolean).join(', ') ??
    null;

  return (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Incident Location</Text>
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          {!coords ? (
            <View style={styles.mapFallback}>
              <Ionicons name="location-outline" size={30} color={C.textSub} />
              <Text style={styles.mapFallbackText}>No coordinates recorded</Text>
            </View>
          ) : mapAvailable ? (
            <MapErrorBoundary>
              <React.Suspense
                fallback={
                  <View style={styles.mapFallback}>
                    <ActivityIndicator color={C.primary} />
                  </View>
                }
              >
                <CitizenLocationMap styleUrl={styleUrl} coords={coords} />
              </React.Suspense>
            </MapErrorBoundary>
          ) : (
            <View style={styles.mapFallback}>
              <Ionicons name="map-outline" size={30} color={C.textSub} />
              <Text style={styles.mapFallbackText}>Map requires latest app build</Text>
            </View>
          )}
        </View>

        {/* Address details */}
        {address && (
          <View style={styles.locationInfo}>
            <Ionicons name="location" size={15} color={C.primary} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationAddress}>{address}</Text>
              {raw.location?.municipality && (
                <Text style={styles.locationSub}>
                  {[raw.location.municipality, raw.location.province].filter(Boolean).join(', ')}
                </Text>
              )}
            </View>
          </View>
        )}

        {coords && (
          <View style={styles.coordsRow}>
            <Ionicons name="navigate-outline" size={13} color={C.textSub} style={{ marginRight: 5 }} />
            <Text style={styles.coordsText}>
              {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Section: Resolution ─────────────────────────────────────────────────────

function ResolutionTab({
  raw,
  onCancel,
}: {
  raw: IncidentHistoryDetail;
  onCancel: () => void;
}) {
  const res = raw.resolution;
  const canCancel = CANCELLABLE_STATUSES.has(raw.status);
  const isTerminalNegative = TERMINAL_NEGATIVE.has(raw.status);

  return (
    <View style={styles.tabContent}>
      {res ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Resolution</Text>
            <View style={[styles.badge, { backgroundColor: C.greenSoft }]}>
              <Ionicons name="checkmark-circle" size={12} color={C.green} style={{ marginRight: 4 }} />
              <Text style={[styles.badgeText, { color: C.greenText }]}>Resolved</Text>
            </View>
          </View>

          {res.notes && (
            <View style={styles.descBox}>
              <Text style={styles.descText}>{res.notes}</Text>
            </View>
          )}

          <View style={styles.infoGrid}>
            {res.outcome && (
              <InfoRow icon="flag-outline" label="Outcome" value={res.outcome.replace(/_/g, ' ')} />
            )}
            {res.disposition && (
              <InfoRow icon="document-outline" label="Disposition" value={res.disposition.replace(/_/g, ' ')} />
            )}
            <InfoRow
              icon="person-outline"
              label="Resolved By"
              value="MDRRMO Operations Center"
            />
            <InfoRow
              icon="calendar-outline"
              label="Resolved At"
              value={formatDate(res.closedAt)}
            />
            <InfoRow
              icon="refresh-outline"
              label="Follow-up Required"
              value={res.followUpRequired ? 'Yes' : 'No'}
            />
          </View>
        </View>
      ) : isTerminalNegative ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Incident Status</Text>
            <View style={[styles.badge, { backgroundColor: C.redSoft }]}>
              <Ionicons name="close-circle" size={12} color={C.red} style={{ marginRight: 4 }} />
              <Text style={[styles.badgeText, { color: C.redText }]}>{STATUS_LABELS[raw.status] ?? raw.status}</Text>
            </View>
          </View>
          <Text style={styles.emptyText}>This incident was marked as {STATUS_LABELS[raw.status]?.toLowerCase() ?? 'terminal'}.</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Resolution</Text>
          </View>
          <View style={styles.pendingWrap}>
            <Ionicons name="time-outline" size={28} color={C.textSub} />
            <Text style={styles.emptyText}>Incident is still active — resolution will appear here once it is closed.</Text>
          </View>
        </View>
      )}

      {/* Cancel — only within the pre-dispatch window */}
      {canCancel && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Cancel this emergency report"
        >
          <Ionicons name="close-circle-outline" size={17} color={C.red} style={{ marginRight: 8 }} />
          <Text style={styles.cancelBtnText}>Cancel Report</Text>
        </TouchableOpacity>
      )}

      <View style={styles.hotlineCard}>
        <Ionicons name="call-outline" size={16} color={C.textSub} style={styles.hotlineIcon} />
        <Text style={styles.hotlineText}>
          For immediate help, call <Text style={styles.hotlineNum}>911</Text> or the{' '}
          <Text style={styles.hotlineNum}>MDRRMO hotline</Text>.
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function IncidentDetailScreen() {
  const routeParams = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(routeParams.id) ? routeParams.id[0] : routeParams.id;
  const router  = useRouter();
  const token   = useAuthStore((s) => s.accessToken);
  const authLoading = useAuthStore((s) => s.isLoading);
  const setActiveIncidentId = useIncidentStore((s) => s.setActiveIncidentId);
  const { isOnline } = useNetworkStatus();
  const mapAvailable = useMemo(() => isNativeMapAvailable(), []);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const {
    data: raw,
    isLoading,
    isError,
    isStale,
    isRefetching,
    refetch,
    error,
  } = useQuery<IncidentHistoryDetail>({
    queryKey: ['incident', id],
    queryFn: () => {
      if (!id || !token) throw new Error('Incident details require an incident ID and an active session.');
      return getIncidentHistoryDetail(id, token);
    },
    enabled: !!id && !!token,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const isActive = raw ? ACTIVE_STATUSES.has(raw.status) : false;

  // Live tracking — active incidents only
  const live = useIncidentTracking(
    isActive ? id : undefined,
    raw?.status ?? null,
  );

  // Keep store in sync: set while active, and release it once this incident ends
  // so home and the SOS button stop showing it as active.
  React.useEffect(() => {
    if (!raw || !id) return;
    if (isActive) setActiveIncidentId(id);
    else if (useIncidentStore.getState().activeIncidentId === id) setActiveIncidentId(null);
  }, [raw, isActive, id, setActiveIncidentId]);

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  async function handleShare() {
    if (!raw) return;
    try {
      await Share.share({
        title: `AGAP Incident ${raw.reference}`,
        message: [
          `Incident Report: ${raw.reference}`,
          `Type: ${TYPE_LABELS[raw.type] ?? raw.type}`,
          `Status: ${STATUS_LABELS[raw.status] ?? raw.status}`,
          `Reported: ${formatDate(raw.reportedAt)}`,
          raw.location?.address ? `Location: ${raw.location.address}` : null,
        ].filter(Boolean).join('\n'),
      });
    } catch { /* cancelled */ }
  }

  function handleCancel() {
    Alert.alert(
      'Cancel Emergency Report?',
      'If this is a real emergency, call 911 or the MDRRMO hotline immediately.\n\nDo you still want to proceed with cancellation?',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Proceed',
          style: 'destructive',
          onPress: () => router.push({ pathname: '/emergency/cancel', params: { id } } as any),
        },
      ],
    );
  }

  function handleBack() {
    router.replace('/incidents');
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
          <ActivityIndicator size="large" color={C.primary} />
        </SafeAreaView>
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={[styles.infoLabel, { marginTop: 12 }]}>Restoring your session…</Text>
        </SafeAreaView>
      </View>
    );
  }

  if (!token || !id || isError || !raw) {
    const status = error instanceof ApiError ? error.status : null;
    const sessionExpired = error instanceof Error && /session expired/i.test(error.message);
    const needsSignIn = !token || status === 401 || sessionExpired;
    const errorMessage = !id
      ? 'This incident link is incomplete. Return to your incident list and open the report again.'
      : needsSignIn
        ? 'Your session is no longer active. Sign in to view your incident details.'
        : status === 403
          ? 'This incident belongs to a different account. Sign in with the account that submitted it.'
          : status === 404
            ? 'This incident could not be found. It may have been removed or the link may be incorrect.'
            : 'We could not reach the incident service. Check your connection and try again.';

    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.appBar}>
            <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={22} color={C.navy} />
            </TouchableOpacity>
          </View>
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle-outline" size={48} color={C.red} />
            <Text style={styles.errorTitle}>Could not load incident</Text>
            <Text style={styles.errorSub}>{errorMessage}</Text>
            {needsSignIn ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.replace('/auth/login')}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Sign in</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, !id && { opacity: 0.5 }]}
                onPress={() => refetch()}
                disabled={!id}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const typeColor  = TYPE_COLORS[raw.type] ?? C.primary;
  const typeIcon   = TYPE_ICONS[raw.type]  ?? 'alert-circle';
  const typeLabel  = TYPE_LABELS[raw.type] ?? raw.type;
  const badge      = statusBadge(raw.status);
  const statusLabel = STATUS_LABELS[raw.status] ?? raw.status;

  const locationShort =
    [raw.location?.barangay, raw.location?.municipality].filter(Boolean).join(', ') ||
    raw.location?.address ||
    'Location pending';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      <SafeAreaView style={{ backgroundColor: C.white }} edges={['top']}>

        {/* App bar */}
        <View style={styles.appBar}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={C.navy} />
          </TouchableOpacity>

          {/* AGAP branding — official wordmark (contains the mark, name, and tagline) */}
          <View style={styles.brandRow}>
            <Image
              source={require('../../assets/icons/agap-icon.png')}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="AGAP — Incident Management Platform"
            />
          </View>

          <View style={styles.appBarRight}>
            {/* Online indicator */}
            <View style={styles.onlineChip}>
              <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#4ADE80' : '#9CA3AF' }]} />
              <Text style={[styles.onlineText, { color: isOnline ? C.greenText : C.textSub }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
            {/* Notification bell */}
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => router.push('/notifications' as any)}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={22} color={C.navy} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Page header */}
        <View style={styles.pageHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Incident Details</Text>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} hitSlop={HIT_SLOP} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Share report">
            <Ionicons name="share-outline" size={16} color={C.primary} style={{ marginRight: 6 }} />
            <Text style={styles.shareBtnText}>Share Report</Text>
          </TouchableOpacity>
        </View>

        {/* Incident card */}
        <View style={styles.incidentCard}>
          <View style={styles.incidentCardLeft}>
            {/* Type icon circle */}
            <View style={[styles.typeIconCircle, { backgroundColor: `${typeColor}15` }]}>
              <Ionicons name={typeIcon} size={22} color={typeColor} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.incidentTitle}>{typeLabel} Incident</Text>
              <Text style={styles.incidentRef}>{raw.reference}</Text>

              <View style={styles.incidentMeta}>
                <Ionicons name="calendar-outline" size={12} color={C.textSub} style={{ marginRight: 4 }} />
                <Text style={styles.incidentMetaText}>{formatDate(raw.reportedAt)}</Text>
              </View>
              <View style={styles.incidentMeta}>
                <Ionicons name="location-outline" size={12} color={C.textSub} style={{ marginRight: 4 }} />
                <Text style={styles.incidentMetaText} numberOfLines={1}>{locationShort}</Text>
              </View>
            </View>
          </View>

          {/* Status (right column) */}
          <View style={styles.incidentCardRight}>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              {badge.icon && (
                <Ionicons name={badge.icon} size={12} color={badge.text} style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.badgeText, { color: badge.text }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        {/* Stale + refreshing indicator */}
        {isStale && !isRefetching && (
          <View style={styles.staleBanner}>
            <Ionicons name="time-outline" size={14} color={C.amberText} />
            <Text style={styles.staleText}>Data may be stale</Text>
            <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn} hitSlop={HIT_SLOP} accessibilityRole="button">
              <Text style={styles.refreshLink}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tab bar */}
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

      {/* Tab content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />
        }
      >
        {activeTab === 'overview' && (
          <OverviewTab
            raw={raw}
            live={live}
            onTrackPress={() => router.push(`/tracking/${id}` as any)}
          />
        )}
        {activeTab === 'timeline' && <TimelineTab raw={raw} />}
        {activeTab === 'notifications' && <NotificationsTab raw={raw} />}
        {activeTab === 'location' && <LocationTab raw={raw} mapAvailable={mapAvailable} />}
        {activeTab === 'resolution' && <ResolutionTab raw={raw} onCancel={handleCancel} />}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  // ── App bar ─────────────────────────────────────────────────────────────────
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 56,
    backgroundColor: C.white,
    gap: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.bg,
  },
  brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  brandLogo: { width: 130, height: 40 },
  appBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onlineChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.bg, borderRadius: 20,
    paddingHorizontal: 10, minHeight: 28,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { fontSize: 12, fontWeight: '700' },
  bellBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  // ── Page header ─────────────────────────────────────────────────────────────
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: C.white,
  },
  pageTitle:    { fontSize: 24, fontWeight: '800', color: C.navy, lineHeight: 30 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, minHeight: 36,
    borderRadius: 18,
    borderWidth: 1, borderColor: `${C.primary}30`,
    backgroundColor: C.primarySoft,
  },
  shareBtnText: { fontSize: 13, fontWeight: '700', color: C.primary },

  // ── Incident card ────────────────────────────────────────────────────────────
  incidentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOW,
  },
  incidentCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginRight: 10 },
  typeIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  incidentTitle: { fontSize: 16, fontWeight: '800', color: C.navy, lineHeight: 22, marginBottom: 2 },
  incidentRef:   { fontSize: 12, fontWeight: '700', color: C.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 6 },
  incidentMeta:  { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  incidentMetaText: { fontSize: 12, color: C.textSub, flex: 1, lineHeight: 16 },
  incidentCardRight: { alignItems: 'flex-end', gap: 8, flexShrink: 0, paddingTop: 2 },

  // ── Badge ────────────────────────────────────────────────────────────────────
  badge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, minHeight: 26,
    borderRadius: 13,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },

  // ── Stale banner ─────────────────────────────────────────────────────────────
  staleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: C.amberSoft,
    borderRadius: 10, paddingLeft: 12, paddingRight: 4, minHeight: 40,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.20)',
  },
  staleText:   { flex: 1, fontSize: 13, color: C.amberText, fontWeight: '600' },
  refreshBtn:  { minHeight: 32, paddingHorizontal: 10, justifyContent: 'center' },
  refreshLink: { fontSize: 13, fontWeight: '700', color: C.primary },

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  tabBar: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: C.bg,
  },
  tabActive: { backgroundColor: C.navy },
  tabText:   { fontSize: 14, fontWeight: '600', color: C.textMid },
  tabTextActive: { color: C.white, fontWeight: '700' },

  // ── Tab content wrapper ───────────────────────────────────────────────────────
  tabContent: { padding: 16, gap: 12 },

  // ── Generic card ────────────────────────────────────────────────────────────
  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    ...SHADOW,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: C.navy },
  cardSub:   { fontSize: 12, color: C.textSub, fontWeight: '600' },

  // ── Description box ──────────────────────────────────────────────────────────
  descBox: {
    backgroundColor: C.bg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  descText: { fontSize: 14, color: C.textMid, lineHeight: 21 },

  // ── Info grid ────────────────────────────────────────────────────────────────
  infoGrid: { gap: 14 },
  infoRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  infoLabel: { fontSize: 12, color: C.textSub, fontWeight: '600', marginBottom: 2 },
  infoValue: { fontSize: 14, color: C.navy, fontWeight: '600', lineHeight: 20 },

  // ── Progress track ───────────────────────────────────────────────────────────
  progressRow:   { flexDirection: 'row' },
  pStep:         { flex: 1, alignItems: 'center' },
  pTrack:        { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', height: 16 },
  progressLabel: { marginTop: 8, paddingHorizontal: 2, fontSize: 12, color: C.textSub, textAlign: 'center', fontWeight: '600' },
  progressLabelDone: { color: C.navy },
  pDot:    { width: 12, height: 12, borderRadius: 6, backgroundColor: C.border },
  pDotDone:{ backgroundColor: C.primary },
  pDotCurrent: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.white, borderWidth: 3, borderColor: C.primary },
  pLine:   { flex: 1, height: 2, backgroundColor: C.border },
  pLineHidden: { backgroundColor: 'transparent' },
  pLineDone: { backgroundColor: C.primary },

  // ── Live tracking card ───────────────────────────────────────────────────────
  liveCard: {
    backgroundColor: C.navy,
    borderRadius: 16,
    padding: 16,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOW,
    shadowColor: '#1A2B4A',
    shadowOpacity: 0.2,
  },
  liveCardLeft:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  liveIconWrap:  { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  liveRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  liveDot:       { width: 7, height: 7, borderRadius: 3.5 },
  liveLabel:     { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.80)', textTransform: 'uppercase', letterSpacing: 0.4 },
  liveEta:       { fontSize: 15, fontWeight: '700', color: C.white, lineHeight: 20 },

  // ── Timeline ─────────────────────────────────────────────────────────────────
  tlRow:   { flexDirection: 'row', alignItems: 'flex-start', minHeight: 52 },
  tlLeft:  { width: 32, alignItems: 'center' },
  tlIconCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  tlLine:  { flex: 1, width: 2, marginTop: 3, borderRadius: 1 },
  tlBody:  { flex: 1, paddingLeft: 12, paddingBottom: 16, paddingTop: 4 },
  tlTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tlTitle: { fontSize: 14, fontWeight: '700', color: C.navy, flex: 1, lineHeight: 20 },
  tlTime:  { fontSize: 13, fontWeight: '600', color: C.textSub, marginLeft: 8 },
  tlNote:  { fontSize: 13, color: C.textMid, lineHeight: 18, marginTop: 2 },
  tlDate:  { fontSize: 12, color: C.textSub, marginTop: 2 },

  // ── Notifications ────────────────────────────────────────────────────────────
  notifRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 60 },
  notifBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  notifIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  notifTitle:   { fontSize: 14, fontWeight: '700', color: C.navy, lineHeight: 20 },
  notifChannel: { fontSize: 12, color: C.textSub, marginTop: 2 },
  notifBadge:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, minHeight: 26, borderRadius: 13 },
  notifBadgeText: { fontSize: 12, fontWeight: '700' },

  // ── Map ──────────────────────────────────────────────────────────────────────
  mapContainer: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: C.bg,
    marginBottom: 12,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.bg,
  },
  mapFallbackText: { fontSize: 13, color: C.textSub, fontWeight: '600' },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  locationAddress: { fontSize: 14, fontWeight: '700', color: C.navy, lineHeight: 20 },
  locationSub:     { fontSize: 13, color: C.textSub, marginTop: 2 },
  coordsRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingLeft: 1 },
  coordsText:  { fontSize: 12, color: C.textSub, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // ── Resolution ───────────────────────────────────────────────────────────────
  pendingWrap: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  emptyText:   { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 20 },

  // ── Cancel ───────────────────────────────────────────────────────────────────
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: C.redSoft,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.22)',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: C.redText },

  // ── Hotline ──────────────────────────────────────────────────────────────────
  hotlineCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 14, borderRadius: 14,
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border,
  },
  hotlineIcon: { marginRight: 10, marginTop: 2 },
  hotlineText: { flex: 1, fontSize: 13, lineHeight: 20, color: C.textSub },
  hotlineNum:  { fontWeight: '700', color: C.textMid },

  // ── Error state ──────────────────────────────────────────────────────────────
  errorWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 56 },
  errorTitle: { fontSize: 18, fontWeight: '800', color: C.navy, marginTop: 16, textAlign: 'center' },
  errorSub:   { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 21, marginTop: 8, marginBottom: 24 },
  primaryBtn: {
    minHeight: 48, minWidth: 160, paddingHorizontal: 28,
    borderRadius: 14, backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: C.white },
});
