import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Image, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';

import { useAuthStore } from '../../src/stores/auth.store';
import { useAccessibilityStore } from '../../src/stores/accessibility.store';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { useActiveIncident } from '../../src/hooks/useActiveIncident';
import { getAnnouncements, type Announcement } from '../../src/services/api/announcements.api';
import { getUnreadCount } from '../../src/services/api/notifications.api';
import { reverseGeocode } from '../../src/services/api/locations.api';
import { BottomNav } from '../../src/components/ui/bottom-nav';
import SOSAlert from '../../src/components/emergency/SOSAlert';

const CITIZEN_STATUSES = ['SUBMITTED', 'ACKNOWLEDGED', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE'];

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  CRITICAL:      { color: '#D44858', bg: '#FDF0F1', icon: 'alert-circle' },
  WARNING:       { color: '#D97706', bg: '#FFFBEB', icon: 'warning' },
  ADVISORY:      { color: '#3B82F6', bg: '#EFF6FF', icon: 'information-circle' },
  INFORMATIONAL: { color: '#0D6053', bg: '#EEF7F4', icon: 'megaphone' },
};


function greeting(t: ReturnType<typeof useTranslations>) {
  const h = new Date().getHours();
  if (h < 12) return t.home.greetingMorning;
  if (h < 18) return t.home.greetingAfternoon;
  return t.home.greetingEvening;
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr ago`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SurgeBanner({ announcement }: { announcement: Announcement }) {
  const router = useRouter();
  const t = useTranslations();
  const cfg = SEVERITY_CONFIG[announcement.severity] ?? SEVERITY_CONFIG.CRITICAL;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: announcement.id } } as any)}
      style={styles.surgeBannerContainer}
    >
      <LinearGradient
        colors={['#8B1A26', '#3A0810']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.surgeBanner}
      >
        {/* Specular glint — matches greeting card treatment */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
          locations={[0, 0.38, 0.85]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.75, y: 0.8 }}
          style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
        />
        <Ionicons name={cfg.icon as any} size={20} color="#FFFFFF" style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.surgeBannerLabel}>{t.home.surgeActive}</Text>
          <Text style={styles.surgeBannerTitle} numberOfLines={1}>{announcement.title}</Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.7)" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

function ActiveIncidentCard({ incident }: { incident: any }) {
  const router = useRouter();
  const t = useTranslations();
  const statusIndex = CITIZEN_STATUSES.indexOf(incident.status);

  return (
    <View style={styles.activeCard}>
      <View style={styles.activeCardHeader}>
        <View style={styles.activeIndicatorRow}>
          <View style={styles.pulseDot} />
          <Text style={styles.activeCardTitle}>{t.home.activeIncidentTitle}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push(`/incidents/${incident.id}` as any)}>
          <Text style={styles.activeCardViewLink}>{t.home.activeIncidentView}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.progressRow}>
        {CITIZEN_STATUSES.map((s, i) => {
          const done = i <= statusIndex;
          const active = i === statusIndex;
          return (
            <React.Fragment key={s}>
              <View style={[styles.progressDot, done ? styles.progressDotDone : null, active ? styles.progressDotActive : null]} />
              {i < CITIZEN_STATUSES.length - 1 && (
                <View style={[styles.progressLine, done && i < statusIndex ? styles.progressLineDone : null]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
      <View style={styles.progressLabels}>
        {CITIZEN_STATUSES.map((s) => (
          <Text key={s} style={styles.progressLabel} numberOfLines={1}>
            {(t.home as any)[`status${s.charAt(0) + s.slice(1).toLowerCase().replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())}`] ?? s}
          </Text>
        ))}
      </View>

      {incident.eta_seconds && (
        <Text style={styles.activeEta}>
          {t.home.activeIncidentEta.replace('{min}', String(Math.ceil(incident.eta_seconds / 60)))}
        </Text>
      )}

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.push('/emergency/confirmation' as any)}>
        <Text style={styles.cancelBtnText}>{t.home.activeIncidentCancel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function QuickActionTile({
  labelKey, subKey, iconName, route, badge,
}: {
  labelKey: string; subKey: string; iconName: string; route: string | null; badge?: number | boolean;
}) {
  const router = useRouter();
  const t = useTranslations();

  return (
    <TouchableOpacity
      style={styles.quickTile}
      activeOpacity={0.78}
      onPress={() => route && router.push(route as any)}
    >
      {/* Subtle inner specular line on top edge */}
      <View style={styles.quickTileSpecular} pointerEvents="none" />

      <View style={styles.quickIconWrap}>
        <Ionicons name={iconName as any} size={22} color="#0D6053" />
        {badge ? (
          <View style={[styles.tileBadge, typeof badge === 'number' ? styles.tileBadgeRed : styles.tileBadgeAmber]}>
            {typeof badge === 'number' && badge > 0 && (
              <Text style={styles.tileBadgeText}>{badge > 99 ? '99+' : badge}</Text>
            )}
          </View>
        ) : null}
      </View>
      <Text style={styles.quickLabel}>{(t.home as any)[`quick${labelKey}`]}</Text>
      <Text style={styles.quickSub} numberOfLines={2}>{(t.home as any)[`quick${subKey}`]}</Text>
    </TouchableOpacity>
  );
}

function AnnouncementCard({ item }: { item: Announcement }) {
  const router = useRouter();
  const cfg = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.INFORMATIONAL;

  return (
    <TouchableOpacity
      style={styles.announcementCard}
      activeOpacity={0.82}
      onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: item.id } } as any)}
    >
      <View style={[styles.annLeftAccent, { backgroundColor: cfg.color }]} />
      <View style={styles.annContent}>
        <View style={styles.annRow}>
          <View style={[styles.annSeverityChip, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon as any} size={10} color={cfg.color} style={{ marginRight: 4 }} />
            <Text style={[styles.annSeverityText, { color: cfg.color }]}>{item.severity}</Text>
          </View>
          <Text style={styles.annCategory}>{item.category.replace(/_/g, ' ')}</Text>
        </View>
        <Text style={styles.annTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.annMeta}>
          {item.scope.replace(/_/g, ' ')} · {item.published_at ? formatRelative(item.published_at) : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const t = useTranslations();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);

  const screenProgress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const { incident: activeIncident } = useActiveIncident();

  useEffect(() => {
    if (reducedMotion) {
      screenProgress.setValue(1);
      return;
    }
    Animated.timing(screenProgress, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, screenProgress]);

  const [locationText, setLocationText] = useState<string | null>(null);
  const [gpsGranted, setGpsGranted] = useState<boolean | null>(null);

  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ['announcements-home'],
    queryFn: () => getAnnouncements({ limit: 3 }),
    staleTime: 60_000,
  });

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['unread-count'],
    queryFn: () => getUnreadCount(),
    enabled: !!accessToken,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setGpsGranted(status === 'granted');
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude } = loc.coords;

        // Reverse geocoding is optional location context (MOD-12). The on-device
        // Android geocoder is frequently unavailable ("Geocoder is not running"),
        // so try it first, fall back to the backend (Mapbox) geocoder, and finally
        // to raw coordinates — a failure must never crash or block the home screen.
        try {
          const [addr] = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (addr) {
            const parts = [addr.street, addr.district ?? addr.subregion, addr.city, addr.region].filter(Boolean);
            if (parts.length) { setLocationText(parts.join(', ')); return; }
          }
        } catch {
          // Device geocoder unavailable — fall through to the backend geocoder.
        }

        try {
          const result = await reverseGeocode(latitude, longitude, accessToken ?? undefined);
          const parts = [result.barangay, result.municipality, result.province].filter(Boolean);
          setLocationText(result.formatted_address ?? (parts.length ? parts.join(', ') : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`));
        } catch {
          setLocationText(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
      } catch {
        // Location permission/fetch failed — the home screen still works without it.
      }
    })();
  }, [accessToken]);

  const surgeBanner = announcements.find((a) => a.severity === 'CRITICAL');
  const announcementsStrip = announcements.filter((a) => a.severity !== 'CRITICAL').slice(0, 2);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />

      {surgeBanner && <SurgeBanner announcement={surgeBanner} />}

      {/* Header — sits on the pearl background, separated with a fine bevel line */}
      <View style={styles.header}>
        <Image source={require('../../assets/icons/agap-icon.png')} style={styles.headerLogo} resizeMode="contain" />
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/notifications' as any)}>
            <Ionicons name="notifications-outline" size={24} color="#1C2B3A" />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/profile')}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{user?.full_name?.[0]?.toUpperCase() ?? 'U'}</Text>
            </View>
            {(user?.profile_completeness ?? 0) < 100 && (
              <View style={styles.avatarBadge} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{
          opacity: screenProgress,
          transform: [{ translateY: screenProgress.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
        }}
      >
        {/* Greeting card — deep green with specular overlay matching the dial treatment */}
        <LinearGradient
          colors={['#0D6053', '#094A3E']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.greetingCard}
        >
          {/* Top-left specular glint */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
            locations={[0, 0.38, 0.85]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.8, y: 0.72 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
          />
          {/* Fine inner bevel border */}
          <View pointerEvents="none" style={styles.greetingCardBevel} />

          <View style={styles.greetingText}>
            <Text style={styles.greetingLine}>{greeting(t)},</Text>
            <Text style={styles.greetingName} numberOfLines={1}>{user?.full_name ?? ''}</Text>
            <Text style={styles.greetingSubtitle}>{t.home.greetingSubtitle}</Text>
          </View>
          {(user?.profile_completeness ?? 100) < 100 && (
            <TouchableOpacity onPress={() => router.push('/profile')}>
              <Text style={styles.completeProfileCta}>{t.home.completeProfile}</Text>
            </TouchableOpacity>
          )}
        </LinearGradient>

        {activeIncident && <ActiveIncidentCard incident={activeIncident} />}

        <SOSAlert hasActiveIncident={!!activeIncident} reducedMotion={reducedMotion} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.home.quickActionsTitle}</Text>
        </View>
        <View style={styles.quickGrid}>
          <QuickActionTile labelKey="Contacts"      subKey="ContactsSub"      iconName="people-outline"             route="/contacts"            badge={false} />
          <QuickActionTile labelKey="Medical"       subKey="MedicalSub"       iconName="pulse-outline"              route="/medical"             badge={false} />
          <QuickActionTile labelKey="FirstAid"      subKey="FirstAidSub"      iconName="medkit-outline"             route="/first-aid" />
          <QuickActionTile labelKey="Readiness"     subKey="ReadinessSub"     iconName="shield-checkmark-outline"   route="/settings/permissions" />
          <QuickActionTile labelKey="History"       subKey="HistorySub"       iconName="document-text-outline"      route="/history" />
          <QuickActionTile labelKey="Notifications" subKey="NotificationsSub" iconName="notifications-outline"      route="/notifications"       badge={unreadCount > 0 ? unreadCount : undefined} />
        </View>

        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
          <Text style={styles.sectionTitle}>{t.home.announcementsTitle}</Text>
          <TouchableOpacity onPress={() => router.push('/announcements')}>
            <Text style={styles.sectionLink}>{t.home.announcementsSeeAll}</Text>
          </TouchableOpacity>
        </View>
        {announcementsStrip.length === 0 ? (
          <Text style={styles.emptyAnnouncements}>{t.home.announcementsEmpty}</Text>
        ) : (
          announcementsStrip.map((a) => <AnnouncementCard key={a.id} item={a} />)
        )}

        <TouchableOpacity
          style={styles.locationCard}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={t.home.locationTitle}
        >
          <View style={styles.locationIconWrap}>
            <Ionicons name="location" size={21} color="#D44858" />
          </View>

          <View style={styles.locationCardContent}>
            <View style={styles.locationTitleRow}>
              <Text style={styles.locationCardLabel}>{t.home.locationTitle}</Text>
              <View style={[styles.gpsStatusPill, gpsGranted === false ? styles.gpsStatusUnavailable : styles.gpsStatusReady]}>
                <View style={[styles.gpsStatusDot, gpsGranted === false ? styles.gpsStatusDotUnavailable : styles.gpsStatusDotReady]} />
                <Text style={[styles.gpsStatusText, gpsGranted === false ? styles.gpsStatusTextUnavailable : styles.gpsStatusTextReady]}>
                  {gpsGranted === false ? 'Unavailable' : 'Ready'}
                </Text>
              </View>
            </View>
            <Text style={styles.locationCardSub} numberOfLines={2}>
              {gpsGranted === false ? t.home.locationUnavailable : (locationText ?? t.common.loading)}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </Animated.ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

// Shared shadow vocabulary — matches the dial's shadow tone (#8795A3) at card scale.
const CARD_SHADOW = {
  shadowColor: '#8795A3',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.10,
  shadowRadius: 16,
  elevation: 4,
};

// Tighter shadow for interactive tiles — slightly warmer, punchier.
const TILE_SHADOW = {
  shadowColor: '#7A8898',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.09,
  shadowRadius: 12,
  elevation: 3,
};

// The bevel border color from HoldToSOS dialInnerBevel — used on all card edges.
const BEVEL_BORDER = 'rgba(168,181,193,0.20)';

const styles = StyleSheet.create({
  // Pearl off-white background — matches the neumorphic dial base colour.
  safeArea: { flex: 1, backgroundColor: '#F2F5F8' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 132 },

  // ─── Surge banner ───────────────────────────────────────────────────────────
  surgeBannerContainer: { marginHorizontal: 16, marginTop: 8, marginBottom: 8, borderRadius: 16, overflow: 'hidden', ...CARD_SHADOW },
  surgeBanner: { minHeight: 58, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  surgeBannerLabel: { fontSize: 10, lineHeight: 12, fontWeight: '800', color: 'rgba(255,200,195,0.9)', letterSpacing: 1.1, textTransform: 'uppercase' },
  surgeBannerTitle: { marginTop: 4, fontSize: 14, lineHeight: 18, fontWeight: '700', color: '#FFFFFF' },

  // ─── Header ─────────────────────────────────────────────────────────────────
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Fine bottom bevel line separating header from pearl page.
    borderBottomWidth: 1,
    borderBottomColor: BEVEL_BORDER,
  },
  headerLogo: { width: 130, height: 44 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Icon buttons match the dial face surface (#EDF1F4).
  headerIconBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EDF1F4',
    borderWidth: 1, borderColor: BEVEL_BORDER,
  },
  notifBadge: {
    position: 'absolute', top: 6, right: 6,
    minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#D44858', borderWidth: 1.5, borderColor: '#F2F5F8',
  },
  notifBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
  avatarBtn: { width: 44, height: 44, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0D6053',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#0D6053', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4,
  },
  avatarInitial: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  avatarBadge: {
    position: 'absolute', right: 0, bottom: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#D97706', borderWidth: 2, borderColor: '#F2F5F8',
  },

  // ─── Greeting card ──────────────────────────────────────────────────────────
  greetingCard: {
    minHeight: 114,
    marginTop: 16, marginBottom: 24,
    paddingHorizontal: 22, paddingVertical: 22,
    borderRadius: 22,
    flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden',
    ...CARD_SHADOW,
    shadowColor: '#094A3E',
    shadowOpacity: 0.22,
  },
  // Fine inner bevel — mirrors dialOuterBevel in HoldToSOS.
  greetingCardBevel: {
    ...StyleSheet.absoluteFill,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  greetingText: { flex: 1, minWidth: 0 },
  greetingLine: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.72)' },
  greetingName: { marginTop: 4, fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  greetingSubtitle: { marginTop: 4, fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.72)' },
  completeProfileCta: { marginLeft: 16, fontSize: 14, fontWeight: '700', color: '#D1FAE5' },

  // ─── Active incident card ────────────────────────────────────────────────────
  activeCard: {
    marginBottom: 24, padding: 20,
    borderRadius: 20, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: BEVEL_BORDER,
    ...CARD_SHADOW,
  },
  activeCardHeader: { marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activeIndicatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D44858' },
  activeCardTitle: { fontSize: 14, fontWeight: '800', color: '#0D6053' },
  activeCardViewLink: { fontSize: 14, fontWeight: '700', color: '#0D6053' },

  progressRow: { height: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#DCE3E9' },
  progressDotDone: { backgroundColor: '#0D6053' },
  progressDotActive: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#0D6053' },
  progressLine: { flex: 1, height: 2, backgroundColor: '#DCE3E9' },
  progressLineDone: { backgroundColor: '#0D6053' },
  progressLabels: { marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { flex: 1, fontSize: 9, color: '#9CA3AF', textAlign: 'center', textTransform: 'uppercase', fontWeight: '600' },
  activeEta: { marginBottom: 16, fontSize: 14, fontWeight: '600', color: '#374151' },
  cancelBtn: {
    minHeight: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FDF0F1', borderWidth: 1, borderColor: 'rgba(212,72,88,0.22)',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#D44858' },

  // ─── Section headers ─────────────────────────────────────────────────────────
  sectionHeader: { minHeight: 44, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#1C2B3A' },
  sectionLink: { fontSize: 14, fontWeight: '700', color: '#0D6053' },

  // ─── Quick action tiles ───────────────────────────────────────────────────────
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16, marginBottom: 32 },
  quickTile: {
    width: '47.5%', padding: 16,
    borderRadius: 20, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: BEVEL_BORDER,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    ...TILE_SHADOW,
  },
  // Fine top-edge specular — mirrors dialOuterBevel highlight on a smaller surface.
  quickTileSpecular: {
    position: 'absolute', left: 1, right: 1, top: 1,
    height: 1, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  // Icon wrap matches the dial's off-white surface (#EDF1F4).
  quickIconWrap: {
    width: 44, height: 44, marginBottom: 12, borderRadius: 22,
    backgroundColor: '#EDF1F4',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    borderWidth: 1, borderColor: BEVEL_BORDER,
  },
  tileBadge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#F2F5F8',
  },
  tileBadgeRed: { backgroundColor: '#D44858' },
  tileBadgeAmber: { backgroundColor: '#D97706' },
  tileBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  quickLabel: { marginBottom: 4, fontSize: 14, fontWeight: '800', color: '#1C2B3A' },
  quickSub: { fontSize: 11, lineHeight: 16, fontWeight: '500', color: '#8795A3' },

  // ─── Announcements ───────────────────────────────────────────────────────────
  emptyAnnouncements: { marginBottom: 24, paddingVertical: 20, fontSize: 14, color: '#8795A3', textAlign: 'center' },
  announcementCard: {
    flexDirection: 'row', marginBottom: 12,
    borderRadius: 20, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: BEVEL_BORDER,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  annLeftAccent: { width: 5 },
  annContent: { flex: 1, padding: 16 },
  annRow: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  annSeverityChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  annSeverityText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  annCategory: { flex: 1, fontSize: 12, fontWeight: '700', color: '#6B7280' },
  annTitle: { marginBottom: 6, fontSize: 15, lineHeight: 22, fontWeight: '700', color: '#1C2B3A' },
  annMeta: { fontSize: 12, fontWeight: '500', color: '#8795A3' },

  // ─── Location card ───────────────────────────────────────────────────────────
  locationCard: {
    marginTop: 8, marginBottom: 24, padding: 18,
    borderRadius: 20, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: BEVEL_BORDER,
    flexDirection: 'row', alignItems: 'center',
    ...CARD_SHADOW,
  },
  locationIconWrap: {
    width: 48, height: 48, marginRight: 16, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FDF0F1',
    borderWidth: 1, borderColor: 'rgba(212,72,88,0.16)',
  },
  locationCardContent: { flex: 1 },
  locationTitleRow: { marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  locationCardLabel: { fontSize: 12, fontWeight: '800', color: '#8795A3', letterSpacing: 1, textTransform: 'uppercase' },
  locationCardSub: { fontSize: 14, fontWeight: '700', color: '#1C2B3A' },
  gpsStatusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  gpsStatusReady: { backgroundColor: '#EEF7F4' },
  gpsStatusUnavailable: { backgroundColor: '#FDF0F1' },
  gpsStatusDot: { width: 6, height: 6, marginRight: 6, borderRadius: 3 },
  gpsStatusDotReady: { backgroundColor: '#0D6053' },
  gpsStatusDotUnavailable: { backgroundColor: '#D44858' },
  gpsStatusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  gpsStatusTextReady: { color: '#0D6053' },
  gpsStatusTextUnavailable: { color: '#D44858' },
});
