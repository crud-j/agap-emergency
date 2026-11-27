import { useEffect, useState } from 'react';
import { AppState, Modal, StatusBar, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { UserRole } from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import { useResponderAssignments } from '@/src/hooks/useResponderAssignments';
import { colors, radius } from '@/src/theme/tokens';
import { assignmentNotificationTag, assignmentPath, openAssignment } from '@/src/lib/assignment-navigation';
import { stopRinging } from '@/modules/agap-alarm';

/** Vibrate 1 s, pause 0.6 s, repeat: while an assignment waits and AGAP is on screen. */
export const ALARM_PATTERN = [0, 1000, 600];

/**
 * How long the screen must stay put before the alarm covers it. Opening AGAP from a
 * tapped assignment push passes through Home first; without this the alarm would flash
 * over Home before the assignment screen opens.
 */
export const ALARM_SETTLE_MS = 900;

/**
 * Which unanswered offer to raise, or null: none, or the responder is already on an
 * offer's screen (then the alarm waits rather than pulling them to another one).
 */
export function alarmOffer<T extends { id: string }>(pendingOffers: T[], pathname: string): T | null {
  if (pendingOffers.some((o) => pathname === assignmentPath(o.id))) return null;
  return pendingOffers[0] ?? null;
}

/**
 * MOD-32: a new assignment can't be missed while AGAP is open. Full screen, vibrating,
 * until the responder opens it (its screen has Accept / Decline). With AGAP closed, the
 * ringing notification does this job (assignment-ring-task.ts, repeated by the server
 * every 30 s). Opening AGAP silences that notification: this alarm takes over.
 * Responders only.
 */
export function AssignmentAlarm() {
  const role = useAuthStore((s) => s.user?.role);
  return role === UserRole.RESPONDER ? <ResponderAssignmentAlarm /> : null;
}

function ResponderAssignmentAlarm() {
  const router = useRouter();
  const pathname = usePathname();
  const { pendingOffers } = useResponderAssignments();
  const offer = alarmOffer(pendingOffers, pathname);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // Wait until navigation stops moving (see ALARM_SETTLE_MS).
  useEffect(() => {
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), ALARM_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pathname]);

  // AGAP is on screen: the ringing notifications stop, the in-app alarm takes over.
  const pendingKey = pendingOffers.map((o) => o.id).join(',');
  useEffect(() => {
    if (!active) return;
    for (const o of pendingOffers) stopRinging(assignmentNotificationTag(o.id));
  }, [active, pendingKey]);

  const shown = !!offer && settled;
  // Only while on screen: in the background the ringing notification takes over.
  const ringing = shown && active;
  useEffect(() => {
    if (!ringing) return;
    Vibration.vibrate(ALARM_PATTERN, true);
    return () => Vibration.cancel();
  }, [ringing, offer?.id]);

  if (!shown || !offer) return null;
  const category = (offer.incidents?.category ?? 'Emergency').replace(/_/g, ' ');
  const more = pendingOffers.length - 1;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <StatusBar barStyle="light-content" backgroundColor={colors.dangerStrong} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.center} accessible accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <View style={styles.iconRing}>
            <Ionicons name="notifications" size={52} color={colors.white} />
          </View>
          <Text style={styles.kicker}>NEW ASSIGNMENT</Text>
          <Text style={styles.title}>{category}</Text>
          {!!offer.incidents?.public_reference && <Text style={styles.ref}>{offer.incidents.public_reference}</Text>}
          <Text style={styles.body}>
            The Operations Center is waiting for your answer. Open it to accept or decline.
          </Text>
          {more > 0 && <Text style={styles.more}>+{more} more waiting</Text>}
        </View>
        <TouchableOpacity
          style={styles.openBtn}
          activeOpacity={0.85}
          onPress={() => openAssignment(router, pathname, offer.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open assignment ${offer.incidents?.public_reference ?? ''}`}
        >
          <Text style={styles.openBtnText}>Open assignment</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.dangerStrong} />
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.dangerStrong, paddingHorizontal: 24, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconRing: {
    width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', marginBottom: 24,
  },
  kicker: { fontSize: 13, fontWeight: '800', letterSpacing: 1.4, color: 'rgba(255,255,255,0.85)', marginBottom: 8 },
  title: { fontSize: 30, fontWeight: '800', color: colors.white, textAlign: 'center', textTransform: 'capitalize' },
  ref: { fontSize: 16, fontWeight: '700', color: colors.white, marginTop: 6, fontVariant: ['tabular-nums'] },
  body: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.92)', textAlign: 'center', lineHeight: 22, marginTop: 16 },
  more: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 12 },
  openBtn: {
    height: 58, borderRadius: radius.lg, backgroundColor: colors.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  openBtnText: { fontSize: 17, fontWeight: '800', color: colors.dangerStrong },
});
