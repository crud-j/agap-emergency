import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/src/stores/auth.store';
import {
  getAssignment,
  acceptAssignment,
  updateAssignmentStatus,
  getIncidentIcs,
  getHandovers,
  acknowledgeHandover,
} from '@/src/services/api/responders.api';
import { getMapConfig } from '@/src/services/api/locations.api';
import { useResponderLocationShare } from '@/src/hooks/useResponderLocationShare';
import { useTransportRoute } from '@/src/hooks/useTransportRoute';
import { useTranslations } from '@/src/hooks/useAccessibility';
import { NavigateButton } from '@/src/components/responder/navigate-button';
import { OutboxBanner, TransportBanners } from '@/src/components/responder/transport-banners';
import { useTransportOutbox } from '@/src/hooks/useTransportOutbox';
import { NetworkError } from '@/src/services/api/http';
import { newOutboxItem, type OutboxItem } from '@/src/services/offline/transport-outbox';
import { ResponderHeader } from '@/src/components/responder/responder-header';
import type { LatLngLite } from '@/src/components/tracking/live-tracking-map';
import { isNativeMapAvailable } from '@/src/components/tracking/native-map-available';
import { categoryIcon, categoryColor, priorityColor, titleCase } from '@/src/lib/incident-visuals';
import {
  isTransportOpenError, nextAssignmentActions, shouldShareLocation, type NextAction,
} from '@/src/lib/assignment-progress';
import {
  formatDistance, formatDuration, shouldShowReporterPatientSwitch,
} from '@/src/lib/transport-target';
import { fieldFlowFor, UNIT_FIELD_FLOW_LABELS, UNIT_FIELD_FLOWS } from '@agap/shared';
import { HelpRequestSheet } from '@/src/components/responder/help-request-sheet';
import { getFireReports } from '@/src/services/api/fire-reports.api';
import { fireSummaryLine, withFireFinishWarning } from '@/src/lib/fire-report';
import { getRescueSummary } from '@/src/services/api/rescue-trips.api';
import { rescueSummaryLine, withRescueFinishWarning } from '@/src/lib/rescue-trip';
import { colors, cardShadow, radius } from '@/src/theme/tokens';
import { DestinationPicker } from '@/src/components/responder/DestinationPicker';
import {
  confirmReporterPatient, recordArrival, updateTransportDestination, type TransportRecord,
} from '@/src/services/api/transport.api';

const LiveTrackingMap = React.lazy(() => Promise.resolve({
  default: require('../../../src/components/tracking/live-tracking-map').default as typeof import('../../../src/components/tracking/live-tracking-map').default,
}));
const MAP_AVAILABLE = isNativeMapAvailable();
// Keyless OpenFreeMap fallback — real OSM streets at municipal zoom (the old
// maplibre.org demo tiles were blank at Bocaue). Used only when the backend
// map-config returns no styleUrl.
const MAPLIBRE_DEMO_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Responder assignment detail (MOD-32 / MOD-43).
 *
 * NOTE — the `[id]` here is the DISPATCH (assignment) id. The On-Scene
 * Assessment screen's `[id]` is the INCIDENT id; this screen passes
 * `data.incident_id` when navigating there. They are different entities.
 *
 * Shows the incident + citizen location on a live map with an in-app route, lets
 * the crew advance the status, and — once the crew has accepted — shares the
 * unit's live location back to the citizen. During transport the route, camera,
 * ETA chip and navigation point at the hospital instead of the scene (Prompt 10).
 */
export default function AssignmentDetailScreen() {
  const { id: dispatchId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  const translations = useTranslations();
  const t = translations.transport;
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reporterBusy, setReporterBusy] = useState(false);
  // FACILITY_AT_CAPACITY from the last destination save (the API's warning).
  const [capacityWarning, setCapacityWarning] = useState(false);
  const [destinationPickerOpen, setDestinationPickerOpen] = useState(false);
  // The server's reason, shown inside the picker (the card behind it is hidden while it is open).
  const [transportSaveError, setTransportSaveError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['responder-assignment', dispatchId],
    queryFn: () => getAssignment(dispatchId as string, token as string),
    enabled: !!dispatchId && !!token,
    refetchInterval: 10000,
  });

  const { data: mapConfig } = useQuery({
    queryKey: ['map-config'],
    queryFn: () => getMapConfig(token ?? undefined),
    enabled: MAP_AVAILABLE,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const incident = data?.incidents ?? null;
  const unit = data?.resources ?? null;
  const loc = incident?.incident_locations ?? null;
  const accent = categoryColor(incident?.category);

  const citizenPoint: LatLngLite | null =
    loc?.latitude != null && loc?.longitude != null
      ? { lat: Number(loc.latitude), lng: Number(loc.longitude) }
      : null;
  const address =
    loc?.formatted_address ??
    ([loc?.barangay, loc?.municipality, loc?.province].filter(Boolean).join(', ') || null);

  const dispatchStatus = data?.status ?? '';
  const incidentStatus = incident?.status ?? null;
  const accepted = dispatchStatus === 'ACCEPTED';
  const shareEnabled = shouldShareLocation(dispatchStatus, incidentStatus);
  // Field progress lives on the incident once the crew has accepted.
  const stage = accepted && incidentStatus ? incidentStatus : dispatchStatus;
  const share = useResponderLocationShare(data?.incident_id, shareEnabled);
  const myPoint: (LatLngLite & { heading?: number; updatedAt?: string }) | null = share.myPosition
    ? {
        lat: share.myPosition.lat,
        lng: share.myPosition.lng,
        ...(share.myPosition.heading != null ? { heading: share.myPosition.heading } : {}),
        updatedAt: share.myPosition.updatedAt,
      }
    : null;

  // Several units can transport from one incident; this screen only handles this crew's dispatch.
  const transport = useTransportRoute({
    dispatchId,
    incidentId: data?.incident_id,
    incidentStatus,
    scene: citizenPoint,
    myPoint,
    enabled: MAP_AVAILABLE && shareEnabled,
  });
  const { route, target, refetchTransports } = transport;
  const activeTransport = transport.myTransport;
  const transportArrived = !!activeTransport?.arrived_at;
  const openTransport = activeTransport && !activeTransport.arrived_at ? activeTransport : null;
  const transporting = incidentStatus === 'TRANSPORTING' && !!openTransport;

  // Plan §19: transport actions tapped offline wait on the phone and are sent in order.
  const outbox = useTransportOutbox(dispatchId);
  const waitingOnPhone = outbox.pending.length > 0;
  // Offline, or behind actions already waiting (they go first): save it on the phone.
  const mustQueue = !outbox.isOnline || waitingOnPhone;

  async function saveOnPhone(item: OutboxItem) {
    const result = await outbox.queue(item);
    if (result === 'FULL') Alert.alert(t.actionFailed, t.outboxFull);
    else if (result === 'ALREADY_QUEUED') Alert.alert(t.savedOnPhone, t.alreadySaved);
    else void outbox.flush();
  }

  const styleUrl = mapConfig?.styleUrl ?? MAPLIBRE_DEMO_STYLE;

  const flow = fieldFlowFor(unit?.resource_type);
  const isFireUnit = flow === UNIT_FIELD_FLOWS.FIRE;
  // A fire unit's latest report (plan Phase 3): shown here and checked on Finish.
  const { data: fireReports } = useQuery({
    queryKey: ['fire-reports', data?.incident_id],
    queryFn: () => getFireReports(data!.incident_id, token as string),
    enabled: isFireUnit && !!data?.incident_id && !!token,
    refetchInterval: 30000,
    retry: false,
  });
  const latestFire = fireReports?.[0] ?? null;
  const isRescueUnit = flow === UNIT_FIELD_FLOWS.RESCUE;
  // A rescue unit's running totals (plan Phase 4): shown here and checked on Finish.
  const { data: rescueSummary } = useQuery({
    queryKey: ['rescue-summary', data?.incident_id],
    queryFn: () => getRescueSummary(data!.incident_id, token as string),
    enabled: isRescueUnit && !!data?.incident_id && !!token,
    refetchInterval: 30000,
    retry: false,
  });
  const actions = nextAssignmentActions(
    dispatchStatus,
    incidentStatus,
    transport.transportsKnown ? (activeTransport ? { open: !activeTransport.arrived_at } : null) : undefined,
    t,
    {
      enRouteAt: data?.en_route_at,
      onSceneAt: data?.on_scene_at,
      fieldDoneAt: data?.field_done_at,
      otherUnitsActive: (data?.active_dispatch_count ?? 1) > 1,
    },
    flow,
  );
  const fieldWorkDone =
    dispatchStatus === 'COMPLETED' || incidentStatus === 'RESOLVED' || incidentStatus === 'CLOSED';

  function onActionPress(action: NextAction) {
    if (action.kind === 'fireReport') {
      router.push(`/responder/fire-report/${dispatchId}` as never);
      return;
    }
    if (action.kind === 'rescueTrip') {
      router.push(`/responder/rescue-trip/${dispatchId}` as never);
      return;
    }
    // A rescue unit finishing while people are still waiting is asked first; never blocked.
    if (action.kind === 'status' && action.status === 'RESOLVED' && isRescueUnit) {
      const confirm = withRescueFinishWarning(action.confirm, rescueSummary?.stillWaiting);
      if (confirm) {
        Alert.alert(confirm.title, confirm.message, [
          { text: 'Not yet', style: 'cancel' },
          { text: action.label, onPress: () => void runAction(action) },
        ]);
        return;
      }
    }
    // A fire unit finishing before "Fire out" is asked first; it is never blocked.
    if (action.kind === 'status' && action.status === 'RESOLVED' && isFireUnit) {
      const confirm = withFireFinishWarning(action.confirm, latestFire?.fire_status);
      if (confirm) {
        Alert.alert(confirm.title, confirm.message, [
          { text: 'Not yet', style: 'cancel' },
          { text: action.label, onPress: () => void runAction(action) },
        ]);
        return;
      }
    }
    if (action.kind === 'arrive') {
      const hospital = openTransport?.facilities?.name;
      Alert.alert(
        t.arriveConfirmTitle,
        hospital ? t.arriveConfirmMessage(hospital) : t.arriveConfirmMessageNoHospital,
        [
          { text: t.notYet, style: 'cancel' },
          { text: action.label, onPress: () => void markArrived() },
        ],
      );
      return;
    }
    if (action.kind === 'status' && action.confirm) {
      Alert.alert(action.confirm.title, action.confirm.message, [
        { text: 'Not yet', style: 'cancel' },
        { text: action.label, onPress: () => void runAction(action) },
      ]);
      return;
    }
    void runAction(action);
  }

  function openPickerAfterStart() {
    void refetchTransports();
    setCapacityWarning(false);
    setTransportSaveError(null);
    setDestinationPickerOpen(true);
  }

  async function runAction(action: NextAction) {
    if (!dispatchId || !token || action.kind === 'arrive' || action.kind === 'fireReport' || action.kind === 'rescueTrip') return;
    // "Start transport" is the one status step that may wait on the phone (plan §19).
    const startItem = action.kind === 'status' && action.status === 'TRANSPORTING' && data?.incident_id
      ? newOutboxItem({ kind: 'start', incidentId: data.incident_id, dispatchId })
      : null;
    if (startItem && mustQueue) {
      await saveOnPhone(startItem);
      // The hospital can be chosen now too; it is sent after the start.
      openPickerAfterStart();
      return;
    }
    setBusy(true);
    try {
      if (action.kind === 'accept') {
        await acceptAssignment(dispatchId, token);
      } else {
        await updateAssignmentStatus(dispatchId, action.status, token, undefined, startItem?.clientRequestId);
      }
      await Promise.all([
        refetch(),
        // Keep Home / Missions / Map tabs in step without waiting for their poll.
        qc.invalidateQueries({ queryKey: ['responder-assignments'] }),
        // Resolving frees the crew; Home's duty card shows it right away.
        qc.invalidateQueries({ queryKey: ['responder-me'] }),
      ]);
      if (action.kind === 'status' && action.status === 'TRANSPORTING') {
        // The server opened the transport record with the status change; load it for the picker.
        openPickerAfterStart();
      }
    } catch (err) {
      if (startItem && err instanceof NetworkError) {
        // Same clientRequestId: if the first try did reach the server, the resend is recognised.
        await saveOnPhone(startItem);
        openPickerAfterStart();
        return;
      }
      if (isTransportOpenError(err)) {
        // Resolve before arrival (409 TRANSPORT_OPEN): reload so "Arrived at hospital" shows.
        void refetchTransports();
        Alert.alert(t.actionFailed, t.resolveBlocked);
        return;
      }
      Alert.alert(
        t.actionFailed,
        err instanceof Error && err.message
          ? err.message
          : 'Could not update the assignment. Please try again.',
      );
    } finally {
      setBusy(false);
    }

  }

  async function saveDestination(destinationId?: string) {
    if (!data?.incident_id || !token || !dispatchId) return;
    // "Decide later": the server already opened the transport with TRANSPORTING, so
    // there is nothing to save; the card shows "Destination not set".
    if (!destinationId) {
      setTransportSaveError(null);
      setDestinationPickerOpen(false);
      return;
    }
    // Set or change the hospital on this crew's open transport (PATCH, never POST start).
    const isOpen = (record: TransportRecord) => record.dispatch_id === dispatchId && !record.arrived_at;
    let open = transport.ownTransports.find(isOpen);
    // A start still waiting on this phone: the destination waits behind it, and the
    // record it belongs to is looked up when it is sent.
    const startWaiting = outbox.pending.some((item) => item.kind === 'start');
    if (!open && !startWaiting) {
      const fresh = await refetchTransports();
      open = ((fresh as { data?: TransportRecord[] }).data ?? []).find(isOpen);
    }
    if (!open && !startWaiting) {
      // Arrival closed this crew's transport; nothing is reopened from here.
      setTransportSaveError(transportArrived ? null : t.transportNotReady);
      if (transportArrived) setDestinationPickerOpen(false);
      return;
    }
    const item = newOutboxItem({
      kind: 'destination', incidentId: data.incident_id, dispatchId, transportId: open?.id ?? null, destinationId,
    });
    const keepOnPhone = async () => {
      await saveOnPhone(item);
      setTransportSaveError(null);
      setDestinationPickerOpen(false);
    };
    if (!open || mustQueue) {
      await keepOnPhone();
      return;
    }
    try {
      const saved = await updateTransportDestination(data.incident_id, open.id, destinationId, token, item.clientRequestId);
      setCapacityWarning(!!saved.warnings?.includes('FACILITY_AT_CAPACITY'));
      setTransportSaveError(null);
      setDestinationPickerOpen(false);
      await refetchTransports();
    } catch (err) {
      if (err instanceof NetworkError) {
        await keepOnPhone();
        return;
      }
      setTransportSaveError(err instanceof Error && err.message ? err.message : 'Destination not saved.');
      // The list may be stale (e.g. a transport opened elsewhere); a retry uses fresh state.
      void refetchTransports();
    }
  }

  async function markArrived() {
    if (!data?.incident_id || !token || !openTransport || !dispatchId) return;
    // The tap time is kept: an arrival sent later from the phone reports when it happened.
    const item = newOutboxItem({
      kind: 'arrive', incidentId: data.incident_id, dispatchId, transportId: openTransport.id,
    });
    if (mustQueue) {
      await saveOnPhone(item);
      return;
    }
    setBusy(true);
    try {
      await recordArrival(data.incident_id, openTransport.id, token, { clientRequestId: item.clientRequestId });
      setCapacityWarning(false);
      await refetchTransports();
    } catch (err) {
      if (err instanceof NetworkError) {
        await saveOnPhone(item);
        return;
      }
      Alert.alert(t.arrivalFailed, err instanceof Error && err.message ? err.message : t.arrivalFailedBody);
    } finally {
      setBusy(false);
    }
  }

  // C17: only the crew's confirmation can show the reporter the hospital. Turning it
  // on asks first; turning it off does not.
  function onReporterSwitch(next: boolean) {
    if (!openTransport) return;
    if (next) {
      Alert.alert(t.reporterConfirmTitle, t.reporterConfirmMessage, [
        { text: t.cancel, style: 'cancel' },
        { text: t.reporterConfirm, onPress: () => void setReporterPatient(openTransport, true) },
      ]);
      return;
    }
    void setReporterPatient(openTransport, false);
  }

  async function setReporterPatient(record: TransportRecord, confirmed: boolean) {
    if (!data?.incident_id || !token) return;
    setReporterBusy(true);
    try {
      await confirmReporterPatient(data.incident_id, record.id, confirmed, token);
      await refetchTransports();
    } catch (err) {
      // e.g. 400 for a guest report or 403 while sharing is off: show the API's reason.
      Alert.alert(t.reporterSwitchFailed, err instanceof Error && err.message ? err.message : t.arrivalFailedBody);
    } finally {
      setReporterBusy(false);
    }
  }

  // Navigation hand-off: the hospital during an open transport, otherwise the scene.
  // A hospital whose location is not verified (or missing) is searched by name.
  const navHospital = transporting ? openTransport?.facilities ?? null : null;
  const navSearch =
    navHospital && (target.kind !== 'FACILITY' || !target.verified)
      ? `${navHospital.name}, ${navHospital.municipality ?? 'Bulacan'}`
      : null;
  const etaText =
    route.durationSeconds == null
      ? null
      : target.kind === 'FACILITY' && target.label
        ? t.etaToHospital(formatDistance(route.distanceMeters), formatDuration(route.durationSeconds), target.label)
        : t.etaToScene(formatDistance(route.distanceMeters), formatDuration(route.durationSeconds));

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/responder/assignments' as never);
  }

  const shareLine = share.permissionDenied
    ? null
    : share.sharing
      ? share.push === 'error'
        ? null
        : share.push === 'ok'
          ? 'Live location sharing active — visible to the citizen'
          : 'Live location sharing active'
      : shareEnabled
        ? 'Starting location sharing…'
        : 'Accept to start sharing your location';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <ResponderHeader
          onBack={goBack}
          title={unit?.call_sign ?? 'Assignment'}
          subtitle={`${unit?.name ?? 'Responding unit'}${unit?.resource_type ? ` · ${UNIT_FIELD_FLOW_LABELS[flow]}` : ''}`}
        />
      </SafeAreaView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !data ? (
        // Only when nothing was ever loaded: a failed 10 s poll (airplane mode) keeps the
        // last loaded assignment on screen, so the crew can still act (plan §19).
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.textSub} />
          </View>
          <Text style={styles.stateTitle}>Could not load this assignment</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.mapWrap}>
            {!MAP_AVAILABLE ? (
              <View style={styles.mapFallback}>
                <Ionicons name="map-outline" size={36} color={colors.textSub} />
                <Text style={styles.muted}>Live map requires the latest app build.</Text>
              </View>
            ) : (
              <MapErrorBoundary>
                <React.Suspense
                  fallback={<View style={styles.mapFallback}><ActivityIndicator color={colors.primary} /></View>}
                >
                  <LiveTrackingMap
                    styleUrl={styleUrl}
                    incident={citizenPoint}
                    responder={myPoint}
                    routeGeometry={route.geometry}
                    routeDimmed={route.lastKnown}
                    destination={transport.destinationMarker}
                    incidentDimmed={incidentStatus === 'TRANSPORTING' && !!transport.destinationMarker}
                    responderIcon="ambulance"
                    citizenSex={incident?.reporter_sex ?? null}
                    priority={incident?.priority}
                    pitch={shareEnabled && myPoint != null ? 50 : 0}
                    navigationHeading={shareEnabled && myPoint?.heading != null ? myPoint.heading : null}
                    supports3dBuildings={mapConfig?.supports3dBuildings ?? false}
                  />
                </React.Suspense>
              </MapErrorBoundary>
            )}

            {/* Route ETA chip floating over the map — always an estimate */}
            {etaText != null && (
              <View style={[styles.etaChip, route.lastKnown && styles.etaChipStale]}>
                <Ionicons name="time" size={14} color={colors.white} style={{ marginRight: 6 }} />
                <Text style={styles.etaChipText} numberOfLines={1}>{etaText}</Text>
              </View>
            )}
          </View>

          <ScrollView
            style={styles.sheet}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Command card */}
            <View style={[styles.card, styles.commandCard, { borderLeftColor: accent }]}>
              <View style={[styles.catIcon, { backgroundColor: `${accent}1A` }]}>
                <Ionicons name={categoryIcon(incident?.category)} size={24} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{titleCase(incident?.category ?? 'Incident')}</Text>
                <Text style={styles.ref}>{incident?.public_reference ?? ''}</Text>
              </View>
              <View style={[styles.prioPill, { backgroundColor: priorityColor(incident?.priority) }]}>
                <Text style={styles.prioText}>{titleCase(incident?.priority)}</Text>
              </View>
            </View>

            {/* Sharing status */}
            <View style={styles.shareStrip}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: share.sharing && share.push !== 'error' ? colors.primary : colors.textSub },
                ]}
              />
              <Text style={styles.shareText}>{shareLine ?? ' '}</Text>
              <View style={styles.statusChip}>
                <Text style={styles.statusChipText}>{titleCase(stage)}</Text>
              </View>
            </View>
            {share.permissionDenied && (
              <View style={styles.warnRow}>
                <Ionicons name="warning" size={14} color={colors.amber} style={{ marginRight: 6 }} />
                <Text style={styles.warnText}>
                  Location permission denied — the citizen can't see your position.
                </Text>
              </View>
            )}
            {share.sharing && share.push === 'error' && (
              <View style={[styles.warnRow, styles.errorRow]}>
                <Ionicons name="cloud-offline" size={14} color={colors.danger} style={{ marginRight: 6 }} />
                <Text style={[styles.warnText, { color: colors.danger }]}>
                  Your location is not reaching the citizen: {share.pushError ?? 'upload failed'}
                </Text>
              </View>
            )}
            <TransportBanners transporting={transporting} target={target} routeLastKnown={route.lastKnown}
              destinationDeactivated={transport.destinationDeactivated} />
            {isError && (
              <View style={styles.warnRow}>
                <Ionicons name="cloud-offline" size={14} color={colors.amber} style={{ marginRight: 6 }} />
                <Text style={styles.warnText}>{t.showingLastLoaded}</Text>
              </View>
            )}
            <OutboxBanner pending={outbox.pending.length} drops={outbox.drops}
              onSendNow={() => void outbox.flush()} onDismiss={outbox.dismiss} />

            {/* Info rows */}
            <InfoRow
              icon="navigate-circle"
              label="Scene location"
              value={address ?? 'Address not available'}
              sub={citizenPoint ? `${citizenPoint.lat.toFixed(5)}, ${citizenPoint.lng.toFixed(5)}` : undefined}
            />
            {incident?.description ? (
              <InfoRow icon="document-text" label="Details" value={incident.description} />
            ) : null}
            {incident?.number_of_patients != null && (
              <InfoRow icon="people" label="Patients" value={String(incident.number_of_patients)} />
            )}
            {isFireUnit && (
              <InfoRow
                icon="flame"
                label="Fire status"
                value={latestFire ? fireSummaryLine(latestFire) : 'No fire report yet'}
                sub={latestFire ? `Reported ${new Date(latestFire.reported_at).toLocaleTimeString()}` : undefined}
              />
            )}
            {isRescueUnit && (
              <InfoRow
                icon="boat"
                label="Rescue trips"
                value={rescueSummary ? rescueSummaryLine(rescueSummary) : 'No trips logged yet'}
                sub={rescueSummary?.lastTripAt ? `Last trip ${new Date(rescueSummary.lastTripAt).toLocaleTimeString()}` : undefined}
              />
            )}

            {incidentStatus === 'TRANSPORTING' && (
              <View style={[styles.card, styles.transportCard]}>
                <View style={styles.transportHeader}>
                  <Ionicons name="medical" size={18} color={colors.primary} />
                  <Text style={styles.infoLabel}>{t.cardTitle}</Text>
                </View>
                <Text style={styles.infoValue}>
                  {activeTransport?.facilities?.name ?? t.destinationNotSet}
                </Text>
                {!transportArrived && activeTransport?.estimated_arrival_at && (
                  <Text style={styles.infoSub}>
                    {t.estArrival(new Date(activeTransport.estimated_arrival_at).toLocaleTimeString())}
                  </Text>
                )}
                {capacityWarning && !transportArrived && (
                  <Text style={styles.warnInline}>{t.atCapacity}</Text>
                )}
                {!!transportSaveError && (
                  <TouchableOpacity onPress={() => setDestinationPickerOpen(true)} accessibilityRole="button">
                    <Text style={styles.errorText}>{t.destinationNotSavedRetry}</Text>
                  </TouchableOpacity>
                )}
                {transportArrived ? (
                  <Text style={styles.arrivedText}>
                    {t.arrivedSummary(new Date(activeTransport!.arrived_at!).toLocaleTimeString())}
                  </Text>
                ) : (
                  <View style={styles.transportActions}>
                    <TouchableOpacity
                      style={styles.destinationButton}
                      onPress={() => setDestinationPickerOpen(true)}
                      disabled={busy}
                      accessibilityRole="button"
                    >
                      <Text style={styles.destinationButtonText}>
                        {activeTransport?.facilities ? t.changeDestination : t.setDestination}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {shouldShowReporterPatientSwitch(openTransport) && (
                  <View style={styles.reporterBlock}>
                    <View style={styles.reporterRow}>
                      <Text style={styles.reporterLabel}>{t.reporterSwitch}</Text>
                      <Switch
                        value={!!openTransport?.reporter_patient_confirmed_at}
                        onValueChange={onReporterSwitch}
                        disabled={reporterBusy}
                        trackColor={{ true: colors.primary, false: colors.track }}
                        accessibilityLabel={t.reporterSwitch}
                      />
                    </View>
                    {openTransport?.reporterClaimsPatient && !openTransport.reporter_patient_confirmed_at && (
                      <Text style={styles.reporterHint}>{t.reporterClaimHint}</Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {navHospital ? (
              <NavigateButton
                lat={target.kind === 'FACILITY' ? target.point?.lat : null}
                lng={target.kind === 'FACILITY' ? target.point?.lng : null}
                label={navHospital.name}
                caption={t.navigateToHospital(navHospital.name)}
                title={t.navigateToHospital(navHospital.name)}
                searchQuery={navSearch}
                warning={navSearch ? t.navigateSearchWarning : null}
                variant="secondary"
                style={{ marginTop: 14 }}
              />
            ) : (
              <NavigateButton
                lat={citizenPoint?.lat}
                lng={citizenPoint?.lng}
                label={address ?? incident?.public_reference}
                caption={t.navigateToScene}
                variant="secondary"
                style={{ marginTop: 14 }}
              />
            )}

            {/* On-scene patient assessment (MOD-37) — available once engaged.
                Takes the INCIDENT id, not this screen's dispatch id. */}
            {data.incident_id && accepted && (
              <LinkRow
                icon="clipboard"
                label="On-Scene Assessment"
                onPress={() => router.push(`/responder/assessment/${data.incident_id}` as never)}
              />
            )}

            {/* Ask dispatch for more help (plan Phase 2 step 5): every unit type, while
                accepted and the incident is still open. Dispatch decides what to send. */}
            {shareEnabled && (
              <LinkRow
                icon="megaphone"
                label={translations.helpRequest.linkLabel}
                onPress={() => setHelpOpen(true)}
              />
            )}

            {/* Incident chat (MOD-33) — message the reporter + dispatch. */}
            {data.incident_id && (
              <LinkRow
                icon="chatbubbles"
                label="Incident Chat"
                onPress={() => router.push(`/incident/chat/${data.incident_id}` as never)}
              />
            )}

            {/* Incident Command structure (MOD-36) — read-only viewer. */}
            {data.incident_id && token && (
              <IcsViewerSection incidentId={data.incident_id} token={token} />
            )}

            {/* Incident handovers (MOD-44) — view + acknowledge an inbound handover. */}
            {data.incident_id && token && (
              <HandoverSection incidentId={data.incident_id} token={token} />
            )}
          </ScrollView>

          {data.incident_id && token && (
            <DestinationPicker
              visible={destinationPickerOpen}
              token={token}
              position={myPoint}
              saveError={transportSaveError}
              onSelect={(destinationId) => void saveDestination(destinationId)}
              onClose={() => setDestinationPickerOpen(false)}
            />
          )}

          {dispatchId && token && (
            <HelpRequestSheet
              visible={helpOpen}
              dispatchId={dispatchId}
              token={token}
              flow={flow}
              onClose={() => setHelpOpen(false)}
            />
          )}

          {actions.length > 0 && (
            <SafeAreaView edges={['bottom']} style={styles.footer}>
              <View style={styles.actionRow}>
                {actions.map((action) => {
                  const secondary = action.kind === 'status' && action.secondary;
                  // The fire report and rescue trip forms only open a screen; what is filed there waits in line itself.
                  const opensForm = action.kind === 'fireReport' || action.kind === 'rescueTrip';
                  const blocked = !opensForm && (busy || waitingOnPhone);
                  return (
                    <TouchableOpacity
                      key={action.label}
                      style={[
                        styles.actionBtn,
                        secondary && styles.actionBtnSecondary,
                        blocked && styles.actionBtnDisabled,
                      ]}
                      onPress={() => onActionPress(action)}
                      // Nothing overtakes an action waiting on the phone (the banner shows it).
                      disabled={blocked}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={action.label}
                    >
                      {busy && !opensForm ? (
                        <ActivityIndicator color={secondary ? colors.primary : '#FFFFFF'} />
                      ) : (
                        <>
                          <Ionicons
                            name={action.icon}
                            size={20}
                            color={secondary ? colors.primary : '#FFFFFF'}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>
                            {action.label}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SafeAreaView>
          )}

          {fieldWorkDone && (
            <SafeAreaView edges={['bottom']} style={styles.footer}>
              <View style={styles.doneBanner}>
                <Ionicons name="checkmark-done-circle" size={22} color={colors.primary} />
                <Text style={styles.doneText}>
                  {incidentStatus === 'CLOSED'
                    ? 'Mission complete — the incident has been closed by the dispatcher.'
                    : 'Mission complete — waiting for the dispatcher to close the incident.'}
                </Text>
              </View>
            </SafeAreaView>
          )}
        </>
      )}
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  sub,
}: {
  icon: IoniconName;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={[styles.card, styles.infoRow]}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
        {sub ? <Text style={styles.infoSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function LinkRow({ icon, label, onPress }: { icon: IoniconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.card, styles.linkRow]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={colors.primary} style={{ marginRight: 8 }} />
      <Text style={styles.linkText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textSub} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

function positionLabel(pos: string): string {
  switch (pos) {
    case 'INCIDENT_COMMANDER':         return 'Incident Commander';
    case 'OPERATIONS_SECTION_CHIEF':   return 'Operations Chief';
    case 'LOGISTICS_SECTION_CHIEF':    return 'Logistics Chief';
    case 'PLANNING_SECTION_CHIEF':     return 'Planning Chief';
    case 'SAFETY_OFFICER':             return 'Safety Officer';
    case 'PUBLIC_INFORMATION_OFFICER': return 'PIO';
    case 'LIAISON_OFFICER':            return 'Liaison Officer';
    default:                           return titleCase(pos);
  }
}

/** MOD-36 — read-only ICS structure for the responding crew. Renders nothing
 *  until ICS is activated (the backend 404s, surfaced here as isError). */
function IcsViewerSection({ incidentId, token }: { incidentId: string; token: string }) {
  const { data: ics, isError } = useQuery({
    queryKey: ['incident-ics', incidentId],
    queryFn: () => getIncidentIcs(incidentId, token),
    enabled: !!incidentId && !!token,
    retry: false,
    refetchInterval: 30000,
  });

  if (isError || !ics) return null;
  const active = ics.ics_assignments.filter((a) => !a.relieved_at);

  return (
    <View style={[styles.card, cmdStyles.section]}>
      <View style={cmdStyles.sectionHead}>
        <Ionicons name="git-network" size={16} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={cmdStyles.sectionTitle}>Incident Command</Text>
        <View style={[cmdStyles.pill, { backgroundColor: ics.deactivated_at ? colors.surface : colors.primarySoft }]}>
          <Text style={[cmdStyles.pillText, ics.deactivated_at && { color: colors.textSub }]}>
            {ics.deactivated_at ? 'Deactivated' : 'Active'}
          </Text>
        </View>
      </View>

      {ics.objectives.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={cmdStyles.subLabel}>Objectives</Text>
          {ics.objectives.map((obj, i) => (
            <View key={i} style={cmdStyles.bulletRow}>
              <View style={cmdStyles.bullet} />
              <Text style={cmdStyles.bodyText}>{obj}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ marginTop: 10 }}>
        <Text style={cmdStyles.subLabel}>Command positions</Text>
        {active.length === 0 ? (
          <Text style={cmdStyles.mutedText}>No positions assigned.</Text>
        ) : (
          active.map((a) => (
            <View key={a.id} style={cmdStyles.posRow}>
              <Text style={[
                cmdStyles.posName,
                a.position === 'INCIDENT_COMMANDER' && { color: colors.danger },
              ]}>
                {positionLabel(a.position)}
              </Text>
              <Text style={cmdStyles.posUser}>
                {a.users?.full_name ?? a.users?.id?.slice(0, 8) ?? '—'}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

/** MOD-44 — handovers for this incident. The responder can acknowledge a
 *  handover addressed to them; creation happens from the ops console. */
function HandoverSection({ incidentId, token }: { incidentId: string; token: string }) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const { data: handovers } = useQuery({
    queryKey: ['incident-handovers', incidentId],
    queryFn: () => getHandovers(incidentId, token),
    enabled: !!incidentId && !!token,
    refetchInterval: 20000,
  });

  const ack = useMutation({
    mutationFn: () => acknowledgeHandover(incidentId, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incident-handovers', incidentId] }),
    onError: () => Alert.alert('Could not acknowledge', 'No pending handover is addressed to you.'),
  });

  const list = handovers ?? [];
  if (list.length === 0) return null;

  const myPending = list.find((h) => h.acknowledged_at == null && h.to_user_id === currentUserId);

  return (
    <View style={[styles.card, cmdStyles.section]}>
      <View style={cmdStyles.sectionHead}>
        <Ionicons name="swap-horizontal" size={16} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={cmdStyles.sectionTitle}>Handovers</Text>
      </View>

      {list.slice(0, 3).map((h) => {
        const acked = h.acknowledged_at != null;
        return (
          <View key={h.id} style={cmdStyles.handoverCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[cmdStyles.posUser, { flex: 1 }]}>
                {(h.users_incident_handovers_from_user_idTousers?.full_name
                  ?? h.from_user_id.slice(0, 8))} → {(h.users_incident_handovers_to_user_idTousers?.full_name
                  ?? h.to_user_id.slice(0, 8))}
              </Text>
              <View style={[cmdStyles.pill, { backgroundColor: acked ? colors.primarySoft : colors.amberSoft }]}>
                <Text style={[cmdStyles.pillText, { color: acked ? colors.primary : colors.amber }]}>
                  {acked ? 'Acknowledged' : 'Pending'}
                </Text>
              </View>
            </View>
            <Text style={[cmdStyles.bodyText, { marginTop: 6 }]}>{h.situation_summary}</Text>
            {h.pending_actions.length > 0 && (
              <View style={{ marginTop: 6 }}>
                {h.pending_actions.map((a, i) => (
                  <View key={i} style={cmdStyles.bulletRow}>
                    <View style={[cmdStyles.bullet, { backgroundColor: colors.amber }]} />
                    <Text style={cmdStyles.bodyText}>{a}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {myPending && (
        <TouchableOpacity
          style={cmdStyles.ackBtn}
          onPress={() => ack.mutate()}
          disabled={ack.isPending}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          {ack.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={cmdStyles.ackText}>Acknowledge handover</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

class MapErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <View style={styles.mapFallback}>
          <Ionicons name="map-outline" size={36} color={colors.textSub} />
          <Text style={styles.muted}>Live map requires the latest app build.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const cmdStyles = StyleSheet.create({
  section: { marginTop: 14, padding: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  subLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textSub,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 6, marginRight: 8 },
  bodyText: { flex: 1, fontSize: 13, color: colors.textMid, lineHeight: 18 },
  mutedText: { fontSize: 13, color: colors.textSub },
  posRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  posName: { fontSize: 13, fontWeight: '700', color: colors.text },
  posUser: { fontSize: 13, color: colors.textMid },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, marginLeft: 8 },
  pillText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  handoverCard: {
    marginTop: 10, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  ackBtn: {
    marginTop: 12, height: 46, borderRadius: radius.md, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  ackText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerSafe: { backgroundColor: colors.bg },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  stateTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  retryBtn: { marginTop: 12, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  muted: { color: colors.textSub, marginTop: 10, textAlign: 'center', fontSize: 13 },

  mapWrap: {
    height: 240, marginHorizontal: 16, marginTop: 12, borderRadius: radius.lg,
    overflow: 'hidden', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, ...cardShadow,
  },
  mapFallback: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  etaChip: {
    position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    ...cardShadow,
  },
  etaChipStale: { opacity: 0.7 },
  etaChipText: { color: colors.white, fontSize: 13, fontWeight: '800', flexShrink: 1 },

  sheet: { flex: 1 },

  card: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, ...cardShadow,
  },

  commandCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderLeftWidth: 4,
  },
  catIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  ref: { fontSize: 12, fontFamily: 'monospace', color: colors.textSub, marginTop: 2 },
  prioPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  prioText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  shareStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingHorizontal: 4,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  shareText: { color: colors.textMid, fontSize: 13, flex: 1 },
  statusChip: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: 'rgba(13,96,83,0.18)',
  },
  statusChipText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  warnRow: {
    flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, padding: 10,
    borderRadius: radius.md, backgroundColor: colors.amberSoft,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.20)',
  },
  errorRow: { backgroundColor: colors.dangerSoft, borderColor: 'rgba(212,72,88,0.20)' },
  warnText: { color: colors.amber, fontSize: 12, flex: 1, lineHeight: 17 },

  infoRow: { flexDirection: 'row', gap: 12, padding: 14, marginTop: 12 },
  infoIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { color: colors.textSub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  infoValue: { color: colors.text, fontSize: 15, lineHeight: 21 },
  infoSub: { color: colors.textSub, fontSize: 12, fontFamily: 'monospace', marginTop: 4 },
  transportCard: { padding: 14, marginTop: 12 },
  transportHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  transportActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  destinationButton: { flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  destinationButtonText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  arrivedText: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 8, lineHeight: 18 },
  warnInline: { color: colors.amber, fontSize: 12, marginTop: 8, lineHeight: 17 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 8 },
  reporterBlock: {
    marginTop: 12, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reporterLabel: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  reporterHint: { color: colors.textSub, fontSize: 12, marginTop: 6, lineHeight: 17 },

  linkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, padding: 16 },
  linkText: { color: colors.text, fontSize: 15, fontWeight: '700' },

  footer: {
    paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', height: 54, borderRadius: radius.lg, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtnSecondary: {
    backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary,
  },
  actionBtnDisabled: { backgroundColor: colors.track, borderColor: colors.track },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  actionTextSecondary: { color: colors.primary },
  doneBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, marginBottom: 10, borderRadius: radius.lg, backgroundColor: colors.primarySoft,
  },
  doneText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text, lineHeight: 20 },
});
