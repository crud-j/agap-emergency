import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { useReadiness, type ReadinessView } from '../../src/hooks/useReadiness';
import { useAuthStore } from '../../src/stores/auth.store';
import { registerPushToken } from '../../src/services/push/push-registration';
import type { PermissionInfo } from '../../src/services/readiness/device-readiness';
import type {
  CheckId,
  CheckStatus,
  CheckTier,
  ReadinessCheck,
  ReadinessStatus,
} from '../../src/services/api/readiness.api';
import type { Translations } from '../../src/i18n/translations';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type ReadinessCopy = Translations['readiness'];

const EMERGENCY_NUMBER = '911';
const TIERS: CheckTier[] = ['ESSENTIAL', 'RECOMMENDED', 'OPTIONAL'];

const CHECK_ICONS: Record<CheckId, IconName> = {
  location: 'location-outline',
  notifications: 'notifications-outline',
  connectivity: 'wifi-outline',
  emergency_contacts: 'people-outline',
  phone_number: 'call-outline',
  camera: 'camera-outline',
  motion_sensor: 'phone-portrait-outline',
  medical_profile: 'pulse-outline',
};

const OVERALL_THEME: Record<ReadinessStatus, { bg: string; accent: string; icon: IconName }> = {
  READY: { bg: '#0D6053', accent: '#A7D7C9', icon: 'shield-checkmark' },
  LIMITED: { bg: '#9A5B0B', accent: '#FDE3B5', icon: 'alert-circle' },
  NOT_READY: { bg: '#B42318', accent: '#FECDCA', icon: 'warning' },
};

const CHECK_THEME: Record<CheckStatus, { fg: string; bg: string; icon: IconName }> = {
  READY: { fg: '#0D6053', bg: '#E7F6F1', icon: 'checkmark-circle' },
  LIMITED: { fg: '#A15C08', bg: '#FFF4E0', icon: 'alert-circle' },
  ACTION_NEEDED: { fg: '#B42318', bg: '#FEF3F2', icon: 'close-circle' },
};

interface CheckAction {
  label: string;
  run: () => Promise<unknown> | void;
  /** Navigation actions refresh on screen focus instead of right away. */
  navigates?: boolean;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function checkCopy(t: ReadinessCopy, check: ReadinessCheck): { title: string; body: string } {
  const copy = t.checks[check.id] as Record<string, string>;
  return { title: copy.title, body: copy[check.reason] ?? copy.OK };
}

// MOD-05 — Emergency Readiness and Permission Status.
export default function PermissionsScreen() {
  const t = useTranslations().readiness;
  const readiness = useReadiness();
  const { refetch } = readiness;

  // Re-check when returning from Contacts, Profile, or Medical (app-foreground is handled by focusManager).
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );

  const data = readiness.data;

  return (
    <View style={styles.root}>
      <ScreenHeader title={t.title} />
      {!data ? (
        <View style={styles.center}>
          {readiness.isError ? (
            <>
              <Ionicons name="alert-circle-outline" size={36} color="#B42318" />
              <Text style={styles.centerText}>{t.actionFailed}</Text>
              <TouchableOpacity style={styles.centerBtn} onPress={() => refetch()} accessibilityRole="button">
                <Text style={styles.centerBtnText}>{t.checkAgain}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator color="#0D6053" size="large" />
              <Text style={styles.centerText}>{t.checking}</Text>
            </>
          )}
        </View>
      ) : (
        <ReadinessContent
          t={t}
          data={data}
          refreshing={readiness.isFetching}
          onRefresh={() => refetch()}
        />
      )}
    </View>
  );
}

function ReadinessContent({
  t,
  data,
  refreshing,
  onRefresh,
}: {
  t: ReadinessCopy;
  data: ReadinessView;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [busyId, setBusyId] = useState<CheckId | null>(null);
  const [failedId, setFailedId] = useState<CheckId | null>(null);

  function permissionAction(info: PermissionInfo, request: () => Promise<unknown>): CheckAction | null {
    if (info.state === 'GRANTED' || info.state === 'UNAVAILABLE') return null;
    return info.canAskAgain
      ? { label: t.actions.allow, run: request }
      : { label: t.actions.openSettings, run: () => Linking.openSettings() };
  }

  function resolveAction(check: ReadinessCheck): CheckAction | null {
    if (check.status === 'READY') return null;
    const { device } = data;
    switch (check.id) {
      case 'location':
        if (check.reason === 'SERVICES_OFF') {
          return {
            label: t.actions.turnOn,
            run: Platform.OS === 'android'
              ? () => Location.enableNetworkProviderAsync()
              : () => Linking.openSettings(),
          };
        }
        return permissionAction(device.location, () => Location.requestForegroundPermissionsAsync());
      case 'notifications': {
        const register = async (requestPermission: boolean) => {
          if (!accessToken) throw new Error('Not signed in');
          if (!(await registerPushToken(accessToken, { requestPermission })) && !requestPermission) {
            throw new Error('Push registration failed');
          }
        };
        if (check.reason === 'NOT_REGISTERED') return { label: t.actions.register, run: () => register(false) };
        if (device.notifications.state === 'GRANTED' || device.notifications.state === 'UNAVAILABLE') return null;
        return device.notifications.canAskAgain
          ? { label: t.actions.allow, run: () => register(true) }
          : { label: t.actions.openSettings, run: () => Linking.openSettings() };
      }
      case 'connectivity':
        return { label: t.actions.retry, run: () => undefined };
      case 'camera':
        return permissionAction(device.camera, () => Camera.requestCameraPermissionsAsync());
      case 'emergency_contacts':
        return { label: t.actions.addContact, run: () => router.push('/contacts'), navigates: true };
      case 'phone_number':
        return { label: t.actions.goToProfile, run: () => router.push('/profile'), navigates: true };
      case 'medical_profile':
        return check.reason === 'NO_CONSENT'
          ? { label: t.actions.manageConsent, run: () => router.push('/profile/privacy'), navigates: true }
          : { label: t.actions.setUp, run: () => router.push('/medical'), navigates: true };
      default:
        return null;
    }
  }

  async function runAction(check: ReadinessCheck, action: CheckAction) {
    setFailedId(null);
    if (action.navigates) {
      action.run();
      return;
    }
    setBusyId(check.id);
    try {
      await action.run();
    } catch {
      setFailedId(check.id);
    } finally {
      setBusyId(null);
      onRefresh();
    }
  }

  const theme = OVERALL_THEME[data.overall];
  const statusTitle = { READY: t.statusReady, LIMITED: t.statusLimited, NOT_READY: t.statusNotReady }[data.overall];
  const statusBody = { READY: t.statusReadyBody, LIMITED: t.statusLimitedBody, NOT_READY: t.statusNotReadyBody }[data.overall];
  const progress = data.total > 0 ? data.passed / data.total : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D6053" colors={['#0D6053']} />}
    >
      {/* Overall status */}
      <View style={[styles.hero, { backgroundColor: theme.bg }]} accessibilityLiveRegion="polite">
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons name={theme.icon} size={30} color={theme.bg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle} accessibilityRole="header">{statusTitle}</Text>
            <Text style={[styles.heroBody, { color: theme.accent }]}>{statusBody}</Text>
          </View>
        </View>

        <Text style={styles.progressLabel}>{t.passed(data.passed, data.total)}</Text>
        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: data.total, now: data.passed }}
        >
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.heroFooter}>
          <View style={styles.heroMeta}>
            <Ionicons
              name={data.sync === 'synced' ? 'cloud-done-outline' : 'phone-portrait-outline'}
              size={14}
              color={theme.accent}
            />
            <Text style={[styles.heroMetaText, { color: theme.accent }]}>
              {t.checkedAt(formatWhen(data.device.checkedAt))}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.heroBtn}
            onPress={onRefresh}
            disabled={refreshing}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.checkAgain}
          >
            {refreshing
              ? <ActivityIndicator size="small" color={theme.bg} />
              : <Ionicons name="refresh" size={15} color={theme.bg} />}
            <Text style={[styles.heroBtnText, { color: theme.bg }]}>{t.checkAgain}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {data.sync !== 'synced' && (
        <View style={styles.syncBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color="#8A4B06" />
          <Text style={styles.syncText}>
            {data.sync === 'offline' ? t.syncOffline : t.syncUnreachable}
            {data.syncedAt ? ` ${t.lastSynced(formatWhen(data.syncedAt))}` : ''}
          </Text>
        </View>
      )}

      <View style={styles.reassure}>
        <Ionicons name="heart-circle" size={20} color="#0D6053" />
        <Text style={styles.reassureText}>{t.sosAlwaysAvailable}</Text>
      </View>

      {TIERS.map((tier) => {
        const checks = data.checks.filter((check) => check.tier === tier);
        const showAccountNote = tier === 'RECOMMENDED' && !data.accountKnown;
        if (checks.length === 0 && !showAccountNote) return null;
        const ready = checks.filter((check) => check.status === 'READY').length;
        const title = { ESSENTIAL: t.tierEssential, RECOMMENDED: t.tierRecommended, OPTIONAL: t.tierOptional }[tier];
        const sub = { ESSENTIAL: t.tierEssentialSub, RECOMMENDED: t.tierRecommendedSub, OPTIONAL: t.tierOptionalSub }[tier];

        return (
          <View key={tier} style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
                <Text style={styles.sectionSub}>{sub}</Text>
              </View>
              {checks.length > 0 && (
                <Text style={styles.sectionCount}>{ready}/{checks.length}</Text>
              )}
            </View>

            <View style={styles.card}>
              {checks.map((check, index) => (
                <CheckRow
                  key={check.id}
                  t={t}
                  check={check}
                  action={resolveAction(check)}
                  busy={busyId === check.id}
                  failed={failedId === check.id}
                  disabled={busyId !== null}
                  last={index === checks.length - 1 && !showAccountNote}
                  onAction={(action) => runAction(check, action)}
                />
              ))}
              {showAccountNote && (
                <View style={styles.accountNote}>
                  <Ionicons name="cloud-offline-outline" size={18} color="#6B7280" />
                  <Text style={styles.accountNoteText}>{t.accountUnknown}</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}

      <View style={styles.hotline}>
        <View style={styles.hotlineHead}>
          <Ionicons name="call" size={18} color="#B42318" />
          <Text style={styles.hotlineTitle}>{t.hotlineTitle}</Text>
        </View>
        <Text style={styles.hotlineBody}>{t.hotlineBody}</Text>
        <TouchableOpacity
          style={styles.hotlineBtn}
          onPress={() => Linking.openURL(`tel:${EMERGENCY_NUMBER}`).catch(() => undefined)}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Ionicons name="call-outline" size={18} color="#FFFFFF" />
          <Text style={styles.hotlineBtnText}>{t.callHotline}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function CheckRow({
  t,
  check,
  action,
  busy,
  failed,
  disabled,
  last,
  onAction,
}: {
  t: ReadinessCopy;
  check: ReadinessCheck;
  action: CheckAction | null;
  busy: boolean;
  failed: boolean;
  disabled: boolean;
  last: boolean;
  onAction: (action: CheckAction) => void;
}) {
  const theme = CHECK_THEME[check.status];
  const { title, body } = checkCopy(t, check);
  const pill = { READY: t.pillReady, LIMITED: t.pillLimited, ACTION_NEEDED: t.pillAction }[check.status];
  const primary = check.tier === 'ESSENTIAL' && check.status === 'ACTION_NEEDED';

  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={[styles.rowIcon, { backgroundColor: theme.bg }]}>
        <Ionicons name={CHECK_ICONS[check.id]} size={20} color={theme.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowHead}>
          <Text style={styles.rowTitle}>{title}</Text>
          <View style={[styles.pill, { backgroundColor: theme.bg }]}>
            <Ionicons name={theme.icon} size={12} color={theme.fg} />
            <Text style={[styles.pillText, { color: theme.fg }]}>{pill}</Text>
          </View>
        </View>
        <Text style={styles.rowBody}>{body}</Text>

        {action && (
          <TouchableOpacity
            style={[styles.actionBtn, primary && styles.actionBtnPrimary, disabled && !busy && styles.actionBtnDisabled]}
            onPress={() => onAction(action)}
            disabled={disabled}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${action.label}: ${title}`}
          >
            {busy ? (
              <ActivityIndicator size="small" color={primary ? '#FFFFFF' : '#0D6053'} />
            ) : (
              <>
                <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{action.label}</Text>
                <Ionicons name="chevron-forward" size={14} color={primary ? '#FFFFFF' : '#0D6053'} />
              </>
            )}
          </TouchableOpacity>
        )}
        {failed && <Text style={styles.actionError}>{t.actionFailed}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  centerText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  centerBtn: {
    height: 44, borderRadius: 12, backgroundColor: '#0D6053',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  centerBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  content: { padding: 16, paddingBottom: 32 },

  hero: { borderRadius: 20, padding: 18, marginBottom: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  heroIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#FFFFFF' },
  heroBody: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  progressLabel: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  heroFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 10 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  heroMetaText: { fontSize: 12, fontWeight: '600' },
  heroBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 12, height: 34,
  },
  heroBtnText: { fontSize: 12, fontWeight: '800' },

  syncBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FCD9A8',
    borderRadius: 14, padding: 12, marginBottom: 12,
  },
  syncText: { flex: 1, fontSize: 13, color: '#8A4B06', lineHeight: 18 },

  reassure: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#E7F6F1', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 18,
  },
  reassureText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0D6053', lineHeight: 18 },

  section: { marginBottom: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  sectionSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  sectionCount: { fontSize: 13, fontWeight: '800', color: '#6B7280' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#EEF2F6',
  },

  row: { flexDirection: 'row', gap: 12, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowTitle: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: '#111827' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  pillText: { fontSize: 11, fontWeight: '800' },
  rowBody: { fontSize: 13, color: '#4B5563', lineHeight: 19, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    minHeight: 38, minWidth: 96, justifyContent: 'center',
    borderRadius: 10, borderWidth: 1.5, borderColor: '#0D6053',
    paddingHorizontal: 14, marginTop: 10,
  },
  actionBtnPrimary: { backgroundColor: '#0D6053' },
  actionBtnDisabled: { opacity: 0.5 },
  actionText: { fontSize: 13, fontWeight: '800', color: '#0D6053' },
  actionTextPrimary: { color: '#FFFFFF' },
  actionError: { fontSize: 12, color: '#B42318', marginTop: 6 },

  accountNote: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  accountNoteText: { flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 18 },

  hotline: {
    backgroundColor: '#FFFBFA', borderWidth: 1, borderColor: '#FECDCA',
    borderRadius: 16, padding: 16,
  },
  hotlineHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hotlineTitle: { fontSize: 15, fontWeight: '800', color: '#B42318' },
  hotlineBody: { fontSize: 13, color: '#7A271A', lineHeight: 19, marginTop: 6 },
  hotlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: 12, backgroundColor: '#B42318', marginTop: 12,
  },
  hotlineBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
