import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { colors, radius } from '@/src/theme/tokens';
import { guestReportStatusKey, useGuestReportStatus } from './GuestReportStatusCard';
import { formatCountdown, secondsUntil } from './guest-status-text';

/**
 * Whether this phone can send another guest report, from the server's `newReportBlock`:
 * an "active report" notice while it is open, a live countdown after a false alert, or
 * a "Report an emergency" button. Shows nothing until the server has answered (or if
 * it is an older one that doesn't say); the server enforces the same rule anyway.
 */
export function GuestNewReportPanel({
  token, onReport, onSignIn,
}: { token: string; onReport: () => void; onSignIn: () => void }) {
  const queryClient = useQueryClient();
  const { data } = useGuestReportStatus(token);
  const block = data?.newReportBlock;
  const until = block?.reason === 'wait' ? block.until : null;
  const [left, setLeft] = useState(() => (until ? secondsUntil(until) : 0));

  useEffect(() => {
    if (!until) return;
    setLeft(secondsUntil(until));
    const timer = setInterval(() => {
      const s = secondsUntil(until);
      setLeft(s);
      if (s <= 0) {
        clearInterval(timer);
        // Ask the server, so the button and the server agree.
        void queryClient.invalidateQueries({ queryKey: guestReportStatusKey(token) });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [until, token, queryClient]);

  if (!data || block === undefined) return null;

  if (block?.reason === 'open') {
    return (
      <View style={[styles.box, styles.activeBox]} accessible accessibilityLiveRegion="polite">
        <View style={styles.row}>
          <Ionicons name="radio-button-on" size={18} color={colors.primary} />
          <Text style={[styles.title, { color: colors.primary }]}>You already have an active report</Text>
        </View>
        <Text style={styles.body}>
          MDRRMO is handling {data.publicReference}. Its status updates below. You can send a new report once it
          is closed. For a different emergency, call 911 or MDRRMO now, or sign in to report.
        </Text>
        <TouchableOpacity style={styles.outlineBtn} onPress={onSignIn} accessibilityRole="button">
          <Text style={styles.outlineBtnText}>Sign in to report a different emergency</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (until && left > 0) {
    return (
      <View
        style={[styles.box, styles.waitBox]}
        accessible
        accessibilityLabel={`Your last report was marked a false alert. You can send a new report in ${Math.ceil(left / 60)} minutes.`}
      >
        <View style={styles.row}>
          <Ionicons name="time-outline" size={18} color={colors.amber} />
          <Text style={[styles.title, { color: colors.amberText }]}>Marked a false alert</Text>
        </View>
        <Text style={styles.body}>
          You can send a new report in <Text style={styles.countdown}>{formatCountdown(left)}</Text>. If this is an
          emergency, call 911 or MDRRMO now, or sign in to report right away.
        </Text>
        <View style={[styles.reportBtn, styles.reportBtnDisabled]} accessibilityState={{ disabled: true }}>
          <Ionicons name="lock-closed" size={16} color={colors.white} style={{ marginRight: 8 }} />
          <Text style={styles.reportBtnText}>Report an emergency · {formatCountdown(left)}</Text>
        </View>
        <TouchableOpacity style={styles.outlineBtn} onPress={onSignIn} accessibilityRole="button">
          <Text style={styles.outlineBtnText}>Sign in to report now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.reportBtn} onPress={onReport} accessibilityRole="button">
      <Ionicons name="alert-circle" size={18} color={colors.white} style={{ marginRight: 8 }} />
      <Text style={styles.reportBtnText}>Report an emergency</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, borderWidth: 1, padding: 14, marginTop: 8, width: '100%' },
  activeBox: { backgroundColor: colors.primarySoft, borderColor: 'rgba(13,96,83,0.25)' },
  waitBox: { backgroundColor: colors.amberSoft, borderColor: 'rgba(217,119,6,0.25)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '800' },
  body: { fontSize: 13, fontWeight: '500', color: colors.textMid, lineHeight: 20 },
  countdown: { fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  outlineBtn: {
    minHeight: 44, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(64,83,109,0.25)',
    backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 12,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700', color: colors.textMid },
  reportBtn: {
    width: '100%', minHeight: 50, borderRadius: radius.lg, backgroundColor: colors.dangerStrong,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  reportBtnDisabled: { backgroundColor: colors.textMuted },
  reportBtnText: { fontSize: 16, fontWeight: '700', color: colors.white, fontVariant: ['tabular-nums'] },
});
