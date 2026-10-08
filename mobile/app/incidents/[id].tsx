import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '../../src/stores/auth.store';
import { useIncidentStore } from '../../src/stores/incident.store';
import { getIncidentHistoryDetail, type IncidentHistoryDetail } from '../../src/services/api/incidents.api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentDetail {
  id: string;
  ticketNumber: string;
  type: string;
  priority: string;
  status: string;
  address: string | null;
  description: string | null;
  reportedAt: string;
  updatedAt: string;
  eta_seconds?: number | null;
  events?: StatusEvent[];
}

interface StatusEvent {
  status: string;
  timestamp: string;
  note?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Citizen-visible progress steps only — internal statuses (ASSESSED, DISPATCH_PENDING,
// RECEIVED) are collapsed into the nearest visible step so the timeline stays simple.
const CITIZEN_STEPS = [
  { key: 'SUBMITTED',    label: 'Submitted'    },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'DISPATCHED',   label: 'Dispatched'   },
  { key: 'EN_ROUTE',     label: 'En Route'     },
  { key: 'ON_SCENE',     label: 'On Scene'     },
] as const;

// Maps any backend status to its citizen-step index (-1 = pre-submission)
const STEP_INDEX: Record<string, number> = {
  SUBMITTED: 0, RECEIVED: 0,
  ACKNOWLEDGED: 1, ASSESSED: 1,
  DISPATCH_PENDING: 2, DISPATCHED: 2,
  EN_ROUTE: 3,
  ON_SCENE: 4, TRANSPORTING: 4, ASSISTING: 4, RESOLVED: 4,
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

const STATUS_DESCRIPTIONS: Record<string, string> = {
  DRAFT:            'Your report is being prepared.',
  SUBMITTED:        'Your emergency has been sent to the operations center.',
  RECEIVED:         'The operations center has received your report.',
  ACKNOWLEDGED:     'A dispatcher has reviewed and acknowledged your emergency.',
  ASSESSED:         'Your emergency is being assessed for response.',
  DISPATCH_PENDING: 'A response unit is being assigned.',
  DISPATCHED:       'A response unit has been assigned to your emergency.',
  EN_ROUTE:         'Responders are on the way to your location.',
  ON_SCENE:         'Responders have arrived at the scene.',
  TRANSPORTING:     'The patient is being transported to a facility.',
  ASSISTING:        'Responders are assisting at the scene.',
  RESOLVED:         'The emergency has been resolved.',
  CLOSED:           'This incident has been closed.',
  CANCELLED:        'This report was cancelled.',
  FALSE_ALERT:      'This report was marked as a false alert.',
  DUPLICATE:        'This report was identified as a duplicate.',
  UNABLE_TO_RESPOND:'Responders were unable to respond at this time.',
  REFERRED:         'This incident has been referred to another agency.',
};

const TYPE_ICONS: Record<string, string> = {
  MEDICAL: 'pulse', ROAD_ACCIDENT: 'car', FLOOD: 'water',
  RESCUE: 'hand-left', FIRE: 'flame', INDUSTRIAL: 'warning',
  DEBRIS: 'layers', OTHER: 'alert-circle',
};

const TYPE_COLORS: Record<string, string> = {
  MEDICAL: '#D44858', ROAD_ACCIDENT: '#D97706', FLOOD: '#3B82F6',
  RESCUE: '#7C3AED', FIRE: '#EA580C', INDUSTRIAL: '#CA8A04',
  DEBRIS: '#6B7280', OTHER: '#0D6053',
};

// Citizen can cancel through DISPATCH_PENDING — mirrors backend pre-dispatch window
const CANCELLABLE_STATUSES = new Set([
  'DRAFT', 'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING',
]);

const ACTIVE_STATUSES = new Set([
  'DRAFT', 'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED',
  'DISPATCH_PENDING', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE',
  'TRANSPORTING', 'ASSISTING',
]);

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  bg: '#F2F5F8',
  white: '#FFFFFF',
  primary: '#0D6053',
  primarySoft: '#EEF7F4',
  text: '#1C2B3A',
  textMid: '#40536D',
  textSub: '#8795A3',
  danger: '#D44858',
  dangerSoft: '#FDF0F1',
  amber: '#D97706',
  border: 'rgba(168,181,193,0.20)',
  progressInactive: '#DCE3E9',
};

const CARD_SHADOW = {
  shadowColor: '#8795A3',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.09,
  shadowRadius: 12,
  elevation: 3,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatDate(iso);
}

// ─── Progress Track ───────────────────────────────────────────────────────────

function ProgressTrack({ status }: { status: string }) {
  const isTerminal = !ACTIVE_STATUSES.has(status);
  const stepIndex = isTerminal ? CITIZEN_STEPS.length : (STEP_INDEX[status] ?? -1);

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressRow}>
        {CITIZEN_STEPS.map((step, i) => {
          const done = i <= stepIndex;
          const current = i === stepIndex && !isTerminal;

          return (
            <React.Fragment key={step.key}>
              <View
                style={[
                  styles.progressDot,
                  done && styles.progressDotDone,
                  current && styles.progressDotCurrent,
                ]}
              />
              {i < CITIZEN_STEPS.length - 1 && (
                <View style={[styles.progressLine, done && i < stepIndex && styles.progressLineDone]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
      <View style={styles.progressLabels}>
        {CITIZEN_STEPS.map((step) => (
          <Text key={step.key} style={styles.progressLabel} numberOfLines={1}>
            {step.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ─── Status Card ──────────────────────────────────────────────────────────────

function StatusCard({ incident }: { incident: IncidentDetail }) {
  const active = ACTIVE_STATUSES.has(incident.status);
  const isNegative = ['CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND'].includes(incident.status);

  const statusColor = active ? C.primary : isNegative ? C.danger : C.textSub;
  const statusBg = active ? C.primarySoft : isNegative ? C.dangerSoft : '#F3F4F6';

  return (
    <View style={styles.statusCard}>
      {/* Status badge */}
      <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
        {active && <View style={styles.statusBadgeDot} />}
        <Text style={[styles.statusBadgeText, { color: statusColor }]}>
          {STATUS_LABELS[incident.status] ?? incident.status}
        </Text>
      </View>

      <Text style={styles.statusDescription}>
        {STATUS_DESCRIPTIONS[incident.status] ?? 'Status updated.'}
      </Text>

      {/* ETA — only shown when en route. Labeled as estimate per MOD-43 rule. */}
      {incident.eta_seconds != null && incident.eta_seconds > 0 && incident.status === 'EN_ROUTE' && (
        <View style={styles.etaRow}>
          <Ionicons name="time-outline" size={16} color={C.primary} style={{ marginRight: 6 }} />
          <Text style={styles.etaText}>
            Estimated arrival: ~{Math.ceil(incident.eta_seconds / 60)} min
          </Text>
          <Text style={styles.etaEstimate}> (estimate)</Text>
        </View>
      )}

      {/* Last updated */}
      <Text style={styles.lastUpdated}>
        Updated {formatRelative(incident.updatedAt)}
      </Text>
    </View>
  );
}

// ─── Info Card ────────────────────────────────────────────────────────────────

function InfoCard({ incident }: { incident: IncidentDetail }) {
  const iconName = (TYPE_ICONS[incident.type] ?? 'alert-circle') as any;
  const iconColor = TYPE_COLORS[incident.type] ?? C.primary;

  return (
    <View style={styles.infoCard}>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Type</Text>
        <View style={styles.infoValue}>
          <View style={[styles.typeIconWrap, { backgroundColor: `${iconColor}14` }]}>
            <Ionicons name={iconName} size={14} color={iconColor} />
          </View>
          <Text style={styles.infoValueText}>{incident.type.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      {incident.address && (
        <View style={[styles.infoRow, styles.infoRowBorder]}>
          <Text style={styles.infoLabel}>Location</Text>
          <Text style={[styles.infoValueText, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>
            {incident.address}
          </Text>
        </View>
      )}

      {incident.description && (
        <View style={[styles.infoRow, styles.infoRowBorder]}>
          <Text style={styles.infoLabel}>Description</Text>
          <Text style={[styles.infoValueText, { flex: 1, textAlign: 'right' }]} numberOfLines={4}>
            {incident.description}
          </Text>
        </View>
      )}

      <View style={[styles.infoRow, styles.infoRowBorder]}>
        <Text style={styles.infoLabel}>Reported</Text>
        <Text style={styles.infoValueText}>{formatDate(incident.reportedAt)}</Text>
      </View>
    </View>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function Timeline({ events }: { events: StatusEvent[] }) {
  if (events.length === 0) return null;

  return (
    <View style={styles.timelineCard}>
      <Text style={styles.timelineTitle}>Status Timeline</Text>
      {events.map((ev, i) => (
        <View key={`${ev.status}-${i}`} style={styles.timelineItem}>
          <View style={styles.timelineLeft}>
            <View style={[styles.timelineDot, i === 0 && styles.timelineDotActive]} />
            {i < events.length - 1 && <View style={styles.timelineConnector} />}
          </View>
          <View style={styles.timelineContent}>
            <Text style={styles.timelineStatus}>
              {STATUS_LABELS[ev.status] ?? ev.status}
            </Text>
            <Text style={styles.timelineTime}>{formatDate(ev.timestamp)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Cancel Button ────────────────────────────────────────────────────────────

function CancelButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.cancelBtn}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel="Cancel this emergency report"
    >
      <Text style={styles.cancelBtnText}>Cancel Report</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function IncidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setActiveIncidentId = useIncidentStore((s) => s.setActiveIncidentId);

  const {
    data: raw,
    isLoading,
    isError,
    isStale,
    isRefetching,
    refetch,
  } = useQuery<IncidentHistoryDetail>({
    queryKey: ['incident', id],
    // Ownership-scoped citizen detail (MOD-42) — returns a safe, mapped shape
    // (no raw/internal DB fields), unlike the ops-oriented GET /:id.
    queryFn: () => getIncidentHistoryDetail(id!, accessToken as string),
    enabled: !!id && !!accessToken,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Adapt the citizen DTO into the shape this screen's cards already consume.
  const incident: IncidentDetail | undefined = raw
    ? {
        id: raw.id,
        ticketNumber: raw.reference,
        type: raw.type,
        priority: raw.priority,
        status: raw.status,
        address: raw.location?.address ?? null,
        description: raw.description,
        reportedAt: raw.reportedAt,
        updatedAt: raw.updatedAt,
        events: raw.timeline.map((t) => ({ status: t.status, timestamp: t.at, note: t.notes })),
      }
    : undefined;

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  function handleCancel() {
    // Show a safety confirmation before opening the reason picker. This guards
    // against accidental taps — the actual reason selection + confirmation
    // happens on /emergency/cancel so the flow is unambiguous.
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
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/incidents');
    }
  }

  const isActiveIncident = incident && ACTIVE_STATUSES.has(incident.status);

  // Keep the store's activeIncidentId in sync when viewing an active incident
  React.useEffect(() => {
    if (isActiveIncident && id) {
      setActiveIncidentId(id);
    }
  }, [isActiveIncident, id, setActiveIncidentId]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {incident && (
              <>
                <Text style={styles.headerTicket}>{incident.ticketNumber}</Text>
                {isStale && !isRefetching && (
                  <View style={styles.stalePill}>
                    <View style={styles.staleDot} />
                    <Text style={styles.staleText}>Stale</Text>
                  </View>
                )}
              </>
            )}
          </View>

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel="Refresh status"
          >
            {isRefetching
              ? <ActivityIndicator size="small" color={C.primary} />
              : <Ionicons name="refresh-outline" size={20} color={C.primary} />
            }
          </TouchableOpacity>
        </View>

        {/* Body */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        ) : isError || !incident ? (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle-outline" size={40} color={C.danger} />
            <Text style={styles.errorTitle}>Could not load incident</Text>
            <Text style={styles.errorSub}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor={C.primary}
                colors={[C.primary]}
              />
            }
          >
            {/* Current status */}
            <StatusCard incident={incident} />

            {/* Live tracking — map + responder ETA, only while the incident is active */}
            {isActiveIncident && (
              <TouchableOpacity
                style={styles.trackBtn}
                activeOpacity={0.85}
                onPress={() => router.push(`/tracking/${id}` as any)}
                accessibilityRole="button"
                accessibilityLabel="Track responder live on a map"
              >
                <Ionicons name="navigate" size={18} color={C.white} style={{ marginRight: 8 }} />
                <Text style={styles.trackBtnText}>Track Live</Text>
              </TouchableOpacity>
            )}

            {/* Progress track — only shown for active incidents */}
            {isActiveIncident && <ProgressTrack status={incident.status} />}

            {/* Incident details */}
            <InfoCard incident={incident} />

            {/* Status event timeline */}
            {incident.events && incident.events.length > 0 && (
              <Timeline events={incident.events} />
            )}

            {/* Cancel — only available for DRAFT/SUBMITTED per MOD-08 */}
            {CANCELLABLE_STATUSES.has(incident.status) && (
              <CancelButton onPress={handleCancel} />
            )}

            {/* Emergency contact reminder */}
            <View style={styles.hotlineCard}>
              <Ionicons name="call-outline" size={16} color={C.textSub} style={{ marginRight: 10 }} />
              <Text style={styles.hotlineText}>
                For immediate help, call <Text style={styles.hotlineNum}>911</Text> or the{' '}
                <Text style={styles.hotlineNum}>MDRRMO hotline</Text>.
              </Text>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safeArea: { flex: 1 },

  header: {
    minHeight: 56,
    paddingHorizontal: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerCenter: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  headerTicket: { fontSize: 14, fontWeight: '800', color: C.text },
  backBtn: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 22,
  },

  stalePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6, backgroundColor: '#FFF8E6',
  },
  staleDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.amber },
  staleText: { fontSize: 9, fontWeight: '700', color: C.amber, textTransform: 'uppercase' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 8 },
  errorSub: { fontSize: 14, color: C.textSub, textAlign: 'center', marginBottom: 24 },
  retryBtn: {
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: C.primary,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: C.white },

  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },

  // ─── Status card ──────────────────────────────────────────────────────────────

  statusCard: {
    marginBottom: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    ...CARD_SHADOW,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, marginBottom: 12,
  },
  statusBadgeDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginRight: 6,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusDescription: { fontSize: 15, fontWeight: '500', color: C.textMid, lineHeight: 22, marginBottom: 12 },

  etaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  etaText: { fontSize: 14, fontWeight: '700', color: C.primary },
  etaEstimate: { fontSize: 12, fontWeight: '500', color: C.textSub },

  lastUpdated: { fontSize: 12, color: C.textSub, marginTop: 4 },

  // ─── Progress ─────────────────────────────────────────────────────────────────

  progressCard: {
    marginBottom: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    ...CARD_SHADOW,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.progressInactive },
  progressDotDone: { backgroundColor: C.primary },
  progressDotCurrent: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: C.white, borderWidth: 3, borderColor: C.primary,
  },
  progressLine: { flex: 1, height: 2, backgroundColor: C.progressInactive },
  progressLineDone: { backgroundColor: C.primary },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { flex: 1, fontSize: 9, color: C.textSub, textAlign: 'center', textTransform: 'uppercase', fontWeight: '600' },

  // ─── Info card ────────────────────────────────────────────────────────────────

  infoCard: {
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
  },
  infoRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  infoLabel: { fontSize: 13, fontWeight: '600', color: C.textSub },
  infoValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoValueText: { fontSize: 13, fontWeight: '700', color: C.text },
  typeIconWrap: {
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },

  // ─── Timeline ─────────────────────────────────────────────────────────────────

  timelineCard: {
    marginBottom: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    ...CARD_SHADOW,
  },
  timelineTitle: { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 16 },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 48 },
  timelineLeft: { width: 20, alignItems: 'center', paddingTop: 2 },
  timelineDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: C.progressInactive,
  },
  timelineDotActive: { backgroundColor: C.primary },
  timelineConnector: { flex: 1, width: 2, backgroundColor: C.progressInactive, marginTop: 2 },
  timelineContent: { flex: 1, paddingLeft: 12, paddingBottom: 16 },
  timelineStatus: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 2 },
  timelineTime: { fontSize: 12, color: C.textSub },

  // ─── Cancel ───────────────────────────────────────────────────────────────────

  cancelBtn: {
    marginBottom: 12,
    minHeight: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.dangerSoft,
    borderWidth: 1, borderColor: 'rgba(212,72,88,0.22)',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: C.danger },

  // ─── Track Live ─────────────────────────────────────────────────────────────

  trackBtn: {
    marginBottom: 12,
    minHeight: 52, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.primary,
    ...CARD_SHADOW,
  },
  trackBtnText: { fontSize: 15, fontWeight: '800', color: C.white },

  // ─── Hotline ──────────────────────────────────────────────────────────────────

  hotlineCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 16, borderRadius: 14,
    backgroundColor: '#F3F4F6',
    borderWidth: 1, borderColor: C.border,
  },
  hotlineText: { flex: 1, fontSize: 13, lineHeight: 20, color: C.textSub },
  hotlineNum: { fontWeight: '700', color: C.textMid },
});
