import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, StatusBar, Easing, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useIncidentStore } from '@/src/stores/incident.store';
import { useAuthStore } from '@/src/stores/auth.store';
import {
  submitIncident, uploadIncidentPhoto, uploadIncidentVideo, type SimilarReportHint,
} from '@/src/services/api/incidents.api';
import { ApiError } from '@/src/services/api/http';
import { MDRRMO_HOTLINE, MDRRMO_HOTLINE_DISPLAY } from '@/src/config/hotlines';
import type { CreateIncidentInput } from '@agap/shared';
import { DUPLICATE_DETECTION_RADIUS_METERS, isCoordinateInBocaue, ReporterType } from '@agap/shared';
import { colors, cardShadow, radius } from '@/src/theme/tokens';
import { useQuery } from '@tanstack/react-query';
import { getMapConfig } from '@/src/services/api/locations.api';
import { isNativeMapAvailable } from '@/src/components/tracking/native-map-available';
import { FALLBACK_MAP_STYLE_URL } from '@/src/config/bocaue-geo';
import type { LatLngLite } from '@/src/components/tracking/live-tracking-map';
import { useIncidentTracking } from '@/src/hooks/useIncidentTracking';
import { useRouteLine } from '@/src/hooks/useRouteLine';

type ResponderPoint = LatLngLite & { heading?: number };

// Lazy so the MapLibre native module imports only when present (never in Expo Go).
const LiveTrackingMap = React.lazy(() => Promise.resolve({
  default: require('../../src/components/tracking/live-tracking-map').default as typeof import('../../src/components/tracking/live-tracking-map').default,
}));

type TransmissionState = 'submitting' | 'success' | 'failed';
/** Photo/video delivery is separate from the report itself and never blocks it. */
type MediaState = 'none' | 'uploading' | 'sent' | 'failed' | 'guest';

// ─── Bocaue-scoped location preview ─────────────────────────────────────────────

class MapErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <View style={[styles.mapCard, styles.mapFallback]}>
          <Ionicons name="map-outline" size={28} color="#9CA3AF" />
          <Text style={styles.mapFallbackText}>Map preview unavailable</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

/**
 * Bocaue-locked incident preview. LiveTrackingMap already clamps the camera to the
 * municipality (maxBounds + zoom 12.5–18.5 from bocaue-geo), so no extra scoping is
 * needed here — just feed it the incident point. Needs a parent with a fixed height
 * because LiveTrackingMap fills its container via StyleSheet.absoluteFill.
 */
function MapPreview({
  location, styleUrl, mapAvailable, responder, routeGeometry, citizenSex, priority,
}: {
  location: LatLngLite | null;
  styleUrl: string;
  mapAvailable: boolean;
  responder: (ResponderPoint & { updatedAt?: string }) | null;
  routeGeometry: Array<[number, number]> | null;
  citizenSex: 'MALE' | 'FEMALE' | null;
  priority?: string | null;
}) {
  if (!mapAvailable) {
    return (
      <View style={[styles.mapCard, styles.mapFallback]}>
        <Ionicons name="map-outline" size={28} color="#9CA3AF" />
        <Text style={styles.mapFallbackText}>Map preview unavailable</Text>
      </View>
    );
  }
  return (
    <View style={styles.mapCard}>
      <MapErrorBoundary>
        <React.Suspense
          fallback={
            <View style={[StyleSheet.absoluteFill, styles.mapFallback]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          }
        >
          <LiveTrackingMap
            styleUrl={styleUrl}
            incident={location}
            responder={responder}
            routeGeometry={routeGeometry}
            responderIcon="ambulance"
            citizenSex={citizenSex}
            priority={priority}
          />
        </React.Suspense>
      </MapErrorBoundary>
    </View>
  );
}

// ─── Submitting ────────────────────────────────────────────────────────────────

function SubmittingView() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.center}>
      <View style={styles.iconWrap}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="sync-outline" size={40} color={colors.primary} />
        </Animated.View>
      </View>
      <Text style={styles.heading}>Sending Emergency Report</Text>
      <Text style={styles.sub}>Connecting to MDRRMO Operations Center…</Text>
    </View>
  );
}

// ─── Success ──────────────────────────────────────────────────────────────────

const MEDIA_STATUS: Record<Exclude<MediaState, 'none'>, { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; warn: boolean }> = {
  uploading: { icon: 'cloud-upload-outline', text: 'Sending your photo/video to the Operations Center…', warn: false },
  sent:      { icon: 'image-outline', text: 'Your photo/video was delivered to the Operations Center.', warn: false },
  failed:    { icon: 'alert-circle-outline', text: 'Your report was sent, but the photo/video could not be uploaded. Responders can still help you.', warn: true },
  guest:     { icon: 'information-circle-outline', text: 'Photos are only sent from signed-in accounts. Your report was still delivered.', warn: true },
};

function MediaStatusCard({ state }: { state: MediaState }) {
  if (state === 'none') return null;
  const m = MEDIA_STATUS[state];
  return (
    <View style={[styles.infoCard, m.warn ? styles.warnCard : styles.successCard]}>
      <Ionicons name={m.icon} size={18} color={m.warn ? colors.amber : colors.primary} />
      <Text style={styles.infoCardText}>{m.text}</Text>
    </View>
  );
}

/** Plain-language status of the earlier report; the wording never names who sent it. */
const SIMILAR_STAGE_TEXT: Record<SimilarReportHint['stage'], { title: string; body: string }> = {
  RECEIVED: {
    title: 'Someone already reported this',
    body: 'MDRRMO received a similar report from this area. Your report adds details and helps confirm it.',
  },
  ASSESSING: {
    title: 'MDRRMO is already assessing this',
    body: 'A dispatcher is already reviewing a similar report from this area. Your report has been added for them to check.',
  },
  RESPONDING: {
    title: 'Responders are already on the way',
    body: 'A team is already heading to a similar report in this area. Your report has been added in case more help is needed.',
  },
  ON_SCENE: {
    title: 'Responders are already at the scene',
    body: 'A team is already at a similar report in this area. If you need help where you are, tell the responders or call the hotline.',
  },
  RESOLVED: {
    title: 'A similar report here was just resolved',
    body: 'If help is still needed, your new report has been sent and a dispatcher will review it.',
  },
};

function SimilarReportCard({ hint }: { hint: SimilarReportHint }) {
  const text = SIMILAR_STAGE_TEXT[hint.stage];
  const when = hint.minutesAgo < 1 ? 'just now' : `${hint.minutesAgo} min ago`;
  return (
    <View
      style={[styles.infoCard, styles.warnCard, { marginTop: 0, marginBottom: 8 }]}
      accessible
      accessibilityLabel={`${text.title}. ${text.body} First reported ${when}.`}
    >
      <Ionicons name="people" size={18} color={colors.amber} />
      <View style={{ flex: 1 }}>
        <Text style={styles.similarTitle}>{text.title}</Text>
        <Text style={styles.infoCardText}>{text.body}</Text>
        <Text style={styles.similarMeta}>First reported {when} · within {DUPLICATE_DETECTION_RADIUS_METERS} m of you</Text>
      </View>
    </View>
  );
}

function SuccessView({
  location, styleUrl, mapAvailable, isGuestReport, reference, onSignIn,
  responder, routeGeometry, etaSeconds, citizenSex, priority, mediaState, similarReport,
}: {
  location: LatLngLite | null;
  styleUrl: string;
  mapAvailable: boolean;
  isGuestReport: boolean;
  reference: string | null;
  onSignIn: () => void;
  responder: (ResponderPoint & { updatedAt?: string }) | null;
  routeGeometry: Array<[number, number]> | null;
  etaSeconds: number | null;
  citizenSex: 'MALE' | 'FEMALE' | null;
  priority: string | null;
  mediaState: MediaState;
  similarReport: SimilarReportHint | null;
}) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.center}>
      <Animated.View style={[styles.iconWrap, styles.iconWrapSuccess, { transform: [{ scale }], opacity }]}>
        <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
      </Animated.View>
      <Text style={styles.heading}>Emergency Report Sent</Text>
      <Text style={styles.sub}>
        The MDRRMO Operations Center has been notified.{'\n'}A dispatcher will review your report shortly.
      </Text>
      {reference && <Text style={styles.reference}>Report reference: {reference}</Text>}
      {similarReport && <SimilarReportCard hint={similarReport} />}
      {location && (
        <MapPreview
          location={location}
          styleUrl={styleUrl}
          mapAvailable={mapAvailable}
          responder={responder}
          routeGeometry={routeGeometry}
          citizenSex={citizenSex}
          priority={priority}
        />
      )}
      {responder && (
        <View style={[styles.infoCard, styles.successCard, { marginTop: 0, marginBottom: 8 }]}>
          <Ionicons name="medkit" size={18} color={colors.primary} />
          <Text style={styles.infoCardText}>
            A responder is on the way — tracking live
            {etaSeconds != null ? ` (estimated ${Math.max(1, Math.round(etaSeconds / 60))} min)` : ''}.
          </Text>
        </View>
      )}
      <View style={[styles.infoCard, styles.successCard]}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
        <Text style={styles.infoCardText}>
          Your report was received. A dispatcher must review it and arrange a response. Keep your phone nearby.
        </Text>
      </View>
      <MediaStatusCard state={mediaState} />
      {isGuestReport && (
        <TouchableOpacity style={styles.ghostBtn} onPress={onSignIn} accessibilityRole="button">
          <Text style={styles.ghostBtnText}>Sign in or create an account</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Failed ───────────────────────────────────────────────────────────────────

function FailedView({
  error, limited, onRetry, onHome, onSignIn,
}: {
  error: string | null;
  /** The backend refused a guest report because this phone/network sent too many. */
  limited: boolean;
  onRetry: () => void;
  onHome: () => void;
  onSignIn: () => void;
}) {
  if (limited) {
    return (
      <View style={styles.center}>
        <View style={[styles.iconWrap, styles.iconWrapDanger]}>
          <Ionicons name="hand-left" size={44} color={colors.danger} />
        </View>
        <Text style={styles.heading}>Report Not Sent</Text>
        <Text style={styles.sub}>
          {error ?? 'Too many reports were sent from this phone without an account.'}
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, styles.callBtn]}
          onPress={() => void Linking.openURL('tel:911').catch(() => undefined)}
          accessibilityRole="button"
        >
          <Ionicons name="call" size={18} color={colors.white} style={{ marginRight: 8 }} />
          <Text style={styles.primaryBtnText}>Call 911</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={() => void Linking.openURL(`tel:${MDRRMO_HOTLINE}`).catch(() => undefined)}
          accessibilityRole="button"
          accessibilityLabel={`Call MDRRMO hotline ${MDRRMO_HOTLINE_DISPLAY}`}
        >
          <Text style={styles.ghostBtnText}>Call MDRRMO · {MDRRMO_HOTLINE_DISPLAY}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={onSignIn} accessibilityRole="button">
          <Text style={styles.ghostBtnText}>Sign in to report</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <View style={[styles.iconWrap, styles.iconWrapDanger]}>
        <Ionicons name="close-circle" size={48} color={colors.danger} />
      </View>
      <Text style={styles.heading}>Transmission Failed</Text>
      <Text style={styles.sub}>
        {error ?? 'We could not send your emergency report.'}
      </Text>

      <View style={[styles.card, styles.hotlineCard, { marginTop: 24 }]}>
        <View style={styles.hotlineHeader}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={[styles.hotlineBold, { color: colors.danger }]}>
            Call 911 or the MDRRMO Hotline immediately.
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.primaryBtnText}>Try Again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.ghostBtn} onPress={onHome} accessibilityRole="button">
        <Text style={styles.ghostBtnText}>Go to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TransmissionScreen() {
  const router = useRouter();
  const { draft, setActiveIncidentId } = useIncidentStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [txState, setTxState] = useState<TransmissionState>('submitting');
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const [publicReference, setPublicReference] = useState<string | null>(null);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [incidentPriority, setIncidentPriority] = useState<string | null>(null);
  const [mediaState, setMediaState] = useState<MediaState>('none');
  const [similarReport, setSimilarReport] = useState<SimilarReportHint | null>(null);

  // Live responder position over the incident room (no-op for guests: no token).
  const live = useIncidentTracking(incidentId ?? undefined);
  const responderPoint: (ResponderPoint & { updatedAt?: string }) | null = live.responder
    ? {
        lat: live.responder.lat,
        lng: live.responder.lng,
        ...(live.responder.heading != null ? { heading: live.responder.heading } : {}),
        updatedAt: live.responder.updatedAt,
      }
    : null;
  const citizenSex = user?.sex === 'MALE' || user?.sex === 'FEMALE' ? user.sex : null;

  const mapAvailable = useMemo(() => isNativeMapAvailable(), []);
  const { data: mapConfig } = useQuery({
    queryKey: ['map-config'],
    queryFn: () => getMapConfig(accessToken ?? undefined),
    enabled: mapAvailable,
    staleTime: 5 * 60 * 1000,
    retry: false,
    gcTime: 30 * 60 * 1000,
  });
  const styleUrl = mapConfig?.styleUrl ?? FALLBACK_MAP_STYLE_URL;
  const incidentLocation: LatLngLite | null = draft.location
    ? { lat: draft.location.lat, lng: draft.location.lng }
    : null;

  const route = useRouteLine(
    mapAvailable ? responderPoint : null,
    mapAvailable ? incidentLocation : null,
  );

  useEffect(() => {
    transmit();
  }, []);

  async function transmit() {
    if (!draft.idempotencyKey || !draft.type) {
      setError('Incomplete emergency report. Please try again.');
      setTxState('failed');
      return;
    }
    if (
      draft.isGuestReport &&
      (!draft.location || !isCoordinateInBocaue(draft.location.lat, draft.location.lng))
    ) {
      setError('A report without an account can only be sent with a GPS location inside Bocaue Municipality.');
      setTxState('failed');
      return;
    }

    const payload: CreateIncidentInput = {
      type: draft.type,
      triggerMethod: draft.triggerMethod,
      idempotencyKey: draft.idempotencyKey,
      description: draft.description ?? undefined,
      lat: draft.location?.lat,
      lng: draft.location?.lng,
      address: draft.manualAddress ?? draft.location?.address ?? undefined,
      reporter: {
        type: draft.isGuestReport ? ReporterType.GUEST_REPORTER : ReporterType.REGISTERED_CITIZEN,
      },
      patient: draft.patient ?? undefined,
      affectedCount: draft.affectedCount ?? undefined,
      hazards: draft.hazards.length ? draft.hazards : undefined,
      responseNeeds: draft.responseNeeds.length ? draft.responseNeeds : undefined,
      intake: draft.intake
        ? {
            answers: draft.intake.answers,
            reporterStatus: draft.intake.reporterStatus ?? undefined,
            landmark: draft.intake.landmark ?? undefined,
          }
        : undefined,
    };

    try {
      const result = await submitIncident(payload, accessToken ?? undefined);
      setActiveIncidentId(result.id);
      setIncidentId(result.id);
      setPublicReference(result.public_reference ?? null);
      setIncidentPriority(result.priority ?? null);
      setSimilarReport(result.similar_report ?? null);
      setTxState('success');

      // Media uploads run after the incident is persisted and never block it,
      // but their outcome is always shown — a failed upload must not be silent.
      const hasMedia = draft.photoUris.length > 0 || !!draft.videoUri;
      if (hasMedia && !accessToken) {
        setMediaState('guest');
      } else if (hasMedia && accessToken) {
        setMediaState('uploading');
        const uploads: { label: string; promise: Promise<void> }[] = [
          ...draft.photoUris.map((uri, i) => ({
            label: `photo[${i}]`,
            promise: uploadIncidentPhoto(
              result.id, uri, accessToken,
              i === 0 ? draft.photoCaptureMeta ?? undefined : undefined,
            ),
          })),
          ...(draft.videoUri
            ? [{
                label: 'video',
                promise: uploadIncidentVideo(result.id, draft.videoUri, accessToken, draft.photoCaptureMeta ?? undefined),
              }]
            : []),
        ];
        Promise.allSettled(uploads.map((u) => u.promise)).then((results) => {
          const failed = results
            .map((r, i) => ({ r, label: uploads[i].label }))
            .filter((x) => x.r.status === 'rejected');
          failed.forEach(({ r, label }) => {
            const reason = (r as PromiseRejectedResult).reason;
            // NetworkError wraps the real fetch exception in `.cause` — log it too,
            // since "No connection to server" alone collapses timeouts, dropped
            // connections, and TLS failures into one indistinguishable message.
            const cause = reason instanceof Error ? (reason as Error & { cause?: unknown }).cause : undefined;
            console.warn(`[transmission] media upload failed (${label}):`, reason, cause ? { cause } : '');
          });
          setMediaState(failed.length === 0 ? 'sent' : 'failed');
          // The screen may already have moved to live tracking — an Alert
          // survives navigation, so the citizen always learns the outcome.
          if (failed.length > 0) {
            Alert.alert(
              'Photo/video not sent',
              'Your emergency report was delivered, but the photo/video could not be uploaded. Responders can still help you.',
            );
          }
        });
      }

      if (accessToken && !draft.isGuestReport) {
        // Leave time to read the "already being handled" notice before tracking opens.
        setTimeout(() => router.replace(`/tracking/${result.id}` as any), result.similar_report ? 7000 : 2500);
      }
    } catch (err) {
      // 429 on a guest report: the per-phone / per-network cap was reached. Retrying
      // would hit it again, so the screen offers the hotlines and sign-in instead.
      setLimited(err instanceof ApiError && err.status === 429);
      // Never hold an emergency for later delivery — tell the reporter now so
      // they can retry or call a hotline instead of waiting on a reconnect.
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reach the MDRRMO Operations Center. Check your connection and try again.',
      );
      setTxState('failed');
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {txState === 'submitting' && <SubmittingView />}
        {txState === 'success'    && (
          <SuccessView
            location={incidentLocation}
            styleUrl={styleUrl}
            mapAvailable={mapAvailable}
            isGuestReport={draft.isGuestReport}
            reference={publicReference}
            onSignIn={() => router.replace('/auth/login')}
            responder={responderPoint}
            routeGeometry={route.geometry ?? null}
            etaSeconds={live.etaSeconds}
            citizenSex={citizenSex}
            priority={incidentPriority}
            mediaState={mediaState}
            similarReport={similarReport}
          />
        )}
        {txState === 'failed'     && (
          <FailedView
            error={error}
            limited={limited}
            onRetry={() => { setTxState('submitting'); transmit(); }}
            onHome={() => router.replace('/home' as any)}
            onSignIn={() => router.replace('/auth/login')}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, paddingVertical: 32,
  },

  // ─── Shared icon wrap ──────────────────────────────────────────────────────
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
    marginBottom: 24,
  },
  iconWrapSuccess: { backgroundColor: colors.primarySoft },
  iconWrapDanger:  { backgroundColor: colors.dangerSoft },

  // ─── Typography ────────────────────────────────────────────────────────────
  heading: {
    fontSize: 24, fontWeight: '800', color: colors.text,
    textAlign: 'center', marginBottom: 10,
  },
  sub: {
    fontSize: 15, fontWeight: '500', color: colors.textMid,
    textAlign: 'center', lineHeight: 22, marginBottom: 16,
  },
  reference: {
    fontSize: 13, fontWeight: '700', color: colors.primary,
    textAlign: 'center', marginBottom: 12,
  },

  // ─── Map preview ─────────────────────────────────────────────────────────────
  mapCard: {
    width: '100%', height: 190, borderRadius: radius.lg, overflow: 'hidden',
    marginBottom: 16, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  mapFallback: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  mapFallbackText: { fontSize: 12, fontWeight: '500', color: colors.textSub },

  // ─── Cards ─────────────────────────────────────────────────────────────────
  card: {
    width: '100%', borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 12,
    ...cardShadow,
  },

  // ─── Hotline card ──────────────────────────────────────────────────────────
  hotlineCard: {
    backgroundColor: colors.dangerSoft,
    borderColor: 'rgba(212,72,88,0.20)',
  },
  hotlineHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6,
  },
  hotlineBold: {
    fontSize: 13, fontWeight: '800', color: colors.text, flexShrink: 1,
  },

  // ─── Info card (success) ───────────────────────────────────────────────────
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: radius.lg, padding: 14,
    marginTop: 8, width: '100%',
  },
  successCard: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1, borderColor: 'rgba(13,96,83,0.18)',
  },
  warnCard: {
    backgroundColor: colors.amberSoft,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.25)',
  },
  infoCardText: {
    flex: 1, fontSize: 13, fontWeight: '500', color: colors.textMid, lineHeight: 20,
  },
  similarTitle: { fontSize: 14, fontWeight: '800', color: '#92400E', marginBottom: 2 },
  similarMeta: { fontSize: 12, fontWeight: '600', color: '#92400E', marginTop: 4 },

  // ─── Buttons ───────────────────────────────────────────────────────────────
  primaryBtn: {
    width: '100%', minHeight: 52, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, marginTop: 8,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },

  ghostBtn: {
    width: '100%', minHeight: 48, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, marginTop: 8,
  },
  ghostBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },
  callBtn: { flexDirection: 'row', backgroundColor: colors.danger },
});
