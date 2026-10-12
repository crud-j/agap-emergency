import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { captureBestFix } from '@/src/services/gps/gps.service';
import { useIncidentStore } from '@/src/stores/incident.store';
import { useAuthStore } from '@/src/stores/auth.store';
import {
  reverseGeocode,
  getMapConfig,
  type ReverseGeocodeResult,
} from '@/src/services/api/locations.api';
import { OnboardProgressbar } from '@/src/components/ui/onbrd-progressbar';
import { AccessibleText } from '@/src/components/accessibility';
import { MapProvider, type MapClientConfig } from '@agap/shared';

const TEAL = '#0D6053';

// Mapbox public token (pk.*) — a non-secret token already shipped to the client.
// It only builds the Static Images URL *when the backend reports Mapbox as the
// active provider*. The provider choice itself comes from /v1/locations/map-config,
// so switching map vendors is a backend config change, not a mobile release.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAP_API_KEY;

// Used when the map-config endpoint is unreachable (offline-first): fall back to
// the build-time provider so the preview still works.
const FALLBACK_MAP_CONFIG: MapClientConfig = {
  provider: MapProvider.MAPBOX,
  styleUrl: null,
  attribution: '© Mapbox © OpenStreetMap',
  staticMapSupported: Boolean(MAPBOX_TOKEN),
  supports3dBuildings: false,
};

/**
 * Builds a static map image URL for the non-interactive preview using whichever
 * provider the backend reports. Returns null when the active provider has no
 * static image API (e.g. MapLibre/OSM) or no token is available, so the caller
 * can fall back to a styled placeholder.
 */
function buildStaticMapUrl(
  coords: { lat: number; lng: number },
  config: MapClientConfig,
): string | null {
  if (!config.staticMapSupported) return null;
  if (config.provider === MapProvider.MAPBOX && MAPBOX_TOKEN) {
    const pin = `pin-l+0d605b(${coords.lng},${coords.lat})`;
    return (
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pin}/` +
      `${coords.lng},${coords.lat},15,0/640x360@2x?access_token=${MAPBOX_TOKEN}`
    );
  }
  return null;
}

type GpsStatus = 'locating' | 'ready' | 'denied' | 'error';

/**
 * MOD-11 (Precision GPS Capture) + MOD-12 (Location Context / Reverse Geocoding).
 * The "Confirm Location" screen shown after the user triggers an SOS. GPS and a
 * precise address are OPTIONAL — the citizen can always continue without them so
 * capturing location never blocks getting help (Architectural Rule 5 / 14).
 */
export default function LocationScreen() {
  const router = useRouter();
  const setLocation = useIncidentStore((s) => s.setLocation);
  const setManualAddress = useIncidentStore((s) => s.setManualAddress);
  const manualAddress = useIncidentStore((s) => s.draft.manualAddress);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('locating');
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [addr, setAddr] = useState<ReverseGeocodeResult | null>(null);
  const [addrLoading, setAddrLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [manualText, setManualText] = useState('');
  const [mapConfig, setMapConfig] = useState<MapClientConfig | null>(null);

  useEffect(() => {
    locate();
    loadMapConfig();
  }, []);

  async function loadMapConfig() {
    try {
      setMapConfig(await getMapConfig(accessToken ?? undefined));
    } catch {
      // Backend unreachable — use the build-time provider so the preview still works.
      setMapConfig(FALLBACK_MAP_CONFIG);
    }
  }

  async function locate() {
    setGpsStatus('locating');
    // Reusable MOD-11 capture: handles permission, best-of-N sampling, and a
    // bounded timeout. Returns a typed outcome — it never throws.
    const outcome = await captureBestFix();
    if (outcome.status !== 'ready') {
      setGpsStatus(outcome.status); // 'denied' | 'error'
      return;
    }
    const next = {
      lat: outcome.fix.lat,
      lng: outcome.fix.lng,
      accuracy: outcome.fix.accuracy,
    };
    setCoords(next);
    // Persist immediately so the report carries GPS even if the user taps
    // Continue before reverse geocoding finishes.
    setLocation(next);
    setGpsStatus('ready');
    resolveAddress(next.lat, next.lng, next.accuracy);
  }

  async function resolveAddress(lat: number, lng: number, accuracy?: number) {
    setAddrLoading(true);
    try {
      const result = await reverseGeocode(lat, lng, accessToken ?? undefined);
      setAddr(result);
      setLocation({
        lat,
        lng,
        accuracy,
        address: result.formatted_address ?? undefined,
        barangay: result.barangay ?? undefined,
      });
    } catch {
      // Reverse geocoding is best-effort — keep the raw coordinates and let the
      // operations center resolve the address server-side if needed.
    } finally {
      setAddrLoading(false);
    }
  }

  function startEdit() {
    setManualText(manualAddress ?? addr?.formatted_address ?? '');
    setEditing(true);
  }

  function saveEdit() {
    const trimmed = manualText.trim();
    setManualAddress(trimmed.length ? trimmed : null);
    setEditing(false);
  }

  function continuePrecise() {
    router.push('/emergency/incident-type');
  }

  function continueWithout() {
    // Proceeding without a precise location is always allowed. Keep any manual
    // address the reporter typed so dispatchers still have context.
    router.push('/emergency/incident-type');
  }

  const displayAddress =
    manualAddress ??
    addr?.formatted_address ??
    (coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : null);

  const detailsReady = gpsStatus === 'ready';

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/icons/agap-solo-icon.png')}
            style={styles.logoMark}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.logoName}>AGAP</Text>
            <Text style={styles.logoTagline}>Incident Management Platform</Text>
          </View>
        </View>
        <OnboardProgressbar currentStep={1} totalSteps={3} style={{ marginTop: 2 }} />
        <Text style={styles.stepLabel}>Confirm Location</Text>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <AccessibleText style={styles.title}>Getting your location...</AccessibleText>
        <AccessibleText style={styles.subtitle} tone="muted">
          We're capturing your current location to help send the nearest responders.
        </AccessibleText>

        {/* Map preview */}
        <View style={styles.mapCard}>
          <MapPreview
            url={coords && mapConfig ? buildStaticMapUrl(coords, mapConfig) : null}
            loading={gpsStatus === 'locating' || (!!coords && !mapConfig)}
          />

          {mapConfig?.attribution ? (
            <Text style={styles.mapAttribution}>{mapConfig.attribution}</Text>
          ) : null}

          {displayAddress && (
            <View style={styles.mapPill}>
              <Text style={styles.mapPillTitle} numberOfLines={1}>
                {addr?.barangay ?? manualAddress ?? 'Current location'}
              </Text>
              <Text style={styles.mapPillSub} numberOfLines={1}>
                {addr ? `${addr.municipality}, ${addr.province}` : 'Bocaue, Bulacan'}
              </Text>
            </View>
          )}

          <View style={styles.mapControls}>
            <View style={styles.mapControlBtn}>
              <Ionicons name="navigate" size={18} color={TEAL} />
            </View>
            <View style={styles.mapControlBtn}>
              <Ionicons name="layers-outline" size={18} color={TEAL} />
            </View>
            <TouchableOpacity style={styles.mapControlBtn} onPress={locate} accessibilityLabel="Refresh location">
              <Ionicons name="locate" size={18} color={TEAL} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status cards */}
        <View style={styles.statusGroup}>
          {/* GPS Status */}
          <View style={styles.statusRow}>
            <View style={styles.statusIcon}>
              <Ionicons name="location" size={20} color={TEAL} />
            </View>
            <View style={styles.statusBody}>
              <Text style={styles.statusTitle}>GPS Status</Text>
              <Text style={styles.statusDesc}>{gpsStatusDescription(gpsStatus)}</Text>
            </View>
            <View style={styles.statusTrail}>
              {gpsStatus === 'locating' ? (
                <ActivityIndicator color={TEAL} />
              ) : gpsStatus === 'ready' ? (
                <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
              ) : (
                <Ionicons name="alert-circle" size={24} color="#F59E0B" />
              )}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Location Details */}
          <View style={styles.statusRow}>
            <View style={styles.statusIcon}>
              <Ionicons name="person" size={20} color={TEAL} />
            </View>
            <View style={styles.statusBody}>
              <Text style={styles.statusTitle}>Location Details</Text>
              <Text style={styles.statusDesc} numberOfLines={2}>
                {addrLoading ? 'Resolving address...' : displayAddress ?? 'Not available yet'}
              </Text>
              <Text style={styles.statusHint}>Will be shared with responders.</Text>
            </View>
            {detailsReady && displayAddress && (
              <View style={styles.readyBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                <Text style={styles.readyBadgeText}>Ready</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* Improve Your Location (Optional) */}
          <View style={styles.statusRow}>
            <View style={styles.statusIcon}>
              <Ionicons name="shield-checkmark" size={20} color={TEAL} />
            </View>
            <View style={styles.statusBody}>
              <Text style={styles.statusTitle}>Improve Your Location (Optional)</Text>
              <Text style={styles.statusHint}>You can add or adjust the location manually if needed.</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={startEdit} accessibilityRole="button">
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {editing && (
            <View style={styles.editArea}>
              <TextInput
                style={styles.input}
                value={manualText}
                onChangeText={setManualText}
                placeholder="e.g. 123 Main St, Brgy. Turo, Bocaue"
                placeholderTextColor="#9CA3AF"
                multiline
                autoFocus
              />
              <View style={styles.editActions}>
                <TouchableOpacity onPress={() => setEditing(false)} style={styles.editCancel}>
                  <Text style={styles.editCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveEdit} style={styles.editSave}>
                  <Text style={styles.editSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <View style={styles.infoIcon}>
            <Ionicons name="information" size={14} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Can't get a precise location?</Text>
            <Text style={styles.infoBody}>
              You can still continue. Our team will assist you based on the information you provide.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer actions */}
      <View style={styles.footer}>
        <TouchableOpacity activeOpacity={0.9} onPress={continuePrecise}>
          <LinearGradient
            colors={['#117C70', '#0A443F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueBtn}
          >
            <Text style={styles.continueText}>Continue</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.8} onPress={continueWithout}>
          <Text style={styles.secondaryText}>Continue without precise location</Text>
        </TouchableOpacity>

        <View style={styles.safetyRow}>
          <Ionicons name="information-circle" size={16} color="#9CA3AF" style={{ marginRight: 6 }} />
          <Text style={styles.safetyText}>
            Your safety is our priority. Do not delay reporting an emergency.
          </Text>
        </View>
      </View>
    </View>
  );
}

function gpsStatusDescription(status: GpsStatus): string {
  switch (status) {
    case 'locating':
      return 'Getting your location...\nThis may take a few seconds.';
    case 'ready':
      return 'Location captured successfully.';
    case 'denied':
      return 'Permission denied. You can continue without precise location.';
    default:
      return 'Could not get GPS. You can continue without precise location.';
  }
}

/**
 * Non-interactive location preview. The image URL is built from the active map
 * provider reported by /v1/locations/map-config, so this screen is vendor-neutral.
 * A null URL (unsupported provider / no token) or a failed load falls back to a
 * styled placeholder; while GPS or the config is still resolving we show a spinner.
 */
function MapPreview({ url, loading }: { url: string | null; loading: boolean }) {
  const [failed, setFailed] = useState(false);

  // Recover if a later refresh produces a loadable tile.
  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return (
      <View style={[styles.map, styles.mapFallback]}>
        {loading ? (
          <>
            <ActivityIndicator color={TEAL} />
            <Text style={styles.mapFallbackText}>Locating you on the map...</Text>
          </>
        ) : (
          <>
            <Ionicons name="map-outline" size={40} color="#9CA3AF" />
            <Text style={styles.mapFallbackText}>Map preview unavailable</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={styles.map}
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessibilityLabel="Map showing your current location"
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  safeTop: { backgroundColor: '#FFFFFF', alignItems: 'center', paddingBottom: 6 },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 14 },
  logoMark: { width: 44, height: 44 },
  logoName: { fontSize: 20, fontWeight: '900', color: TEAL, letterSpacing: 0.5 },
  logoTagline: { fontSize: 10, color: '#6B7280', fontWeight: '500' },

  stepLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', letterSpacing: 0.3, marginTop: 6 },

  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  title: { fontSize: 30, fontWeight: '800', color: TEAL, lineHeight: 36, marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', lineHeight: 21, marginBottom: 18 },

  // Map
  mapCard: { borderRadius: 18, overflow: 'hidden', marginBottom: 18, backgroundColor: '#E5E7EB' },
  map: { width: '100%', height: 190 },
  mapFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2F1' },
  mapFallbackText: { marginTop: 8, fontSize: 13, color: '#6B7280', fontWeight: '500' },
  mapPill: {
    position: 'absolute', top: 14, alignSelf: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3, maxWidth: '80%',
  },
  mapPillTitle: { fontSize: 13, fontWeight: '700', color: '#111827', textAlign: 'center' },
  mapPillSub: { fontSize: 11, color: '#6B7280', textAlign: 'center' },
  mapAttribution: {
    position: 'absolute', left: 8, bottom: 6,
    fontSize: 9, color: '#374151',
    backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },
  mapControls: { position: 'absolute', top: 12, right: 12, gap: 8 },
  mapControlBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },

  // Status group
  statusGroup: { backgroundColor: '#F9FAFB', borderRadius: 18, padding: 16, marginBottom: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start' },
  statusIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#E6F2EF',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  statusBody: { flex: 1, paddingTop: 2 },
  statusTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  statusDesc: { fontSize: 12, color: '#4B5563', lineHeight: 17 },
  statusHint: { fontSize: 11, color: '#9CA3AF', lineHeight: 16, marginTop: 1 },
  statusTrail: { width: 28, alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  divider: { height: 1, backgroundColor: '#ECECEC', marginVertical: 14 },

  readyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#DCFCE7', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginTop: 2,
  },
  readyBadgeText: { fontSize: 12, fontWeight: '700', color: '#16A34A' },

  editBtn: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 6, marginTop: 2,
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },

  editArea: { marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 12,
    fontSize: 14, color: '#111827', minHeight: 64, textAlignVertical: 'top', backgroundColor: '#FFFFFF',
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  editCancel: { paddingHorizontal: 16, paddingVertical: 8 },
  editCancelText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  editSave: { backgroundColor: TEAL, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 },
  editSaveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  // Info banner
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14,
  },
  infoIcon: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#1E3A8A', marginBottom: 2 },
  infoBody: { fontSize: 12, color: '#3B5BA5', lineHeight: 17 },

  // Footer
  footer: {
    paddingHorizontal: 20, paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 30 : 18,
    borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#FFFFFF',
  },
  continueBtn: { height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  continueText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  secondaryBtn: {
    height: 56, borderRadius: 14, borderWidth: 1, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
  },
  secondaryText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  safetyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  safetyText: { fontSize: 11, color: '#9CA3AF', flexShrink: 1 },
});
