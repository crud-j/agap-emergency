import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchGuestReportStatus } from '@/src/services/api/guest-report.api';
import { ApiError } from '@/src/services/api/http';
import { enableGuestReportPush } from '@/src/services/guest-report/saved-guest-report';
import { colors, radius } from '@/src/theme/tokens';
import { GUEST_MERGED_NOTE, guestStatusText, type GuestStatusTone } from './guest-status-text';

/** While the report is open, check this often (the server allows it). */
const POLL_MS = 15_000;

export const guestReportStatusKey = (token: string) => ['guest-report-status', token] as const;

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const TONE: Record<GuestStatusTone, { fg: string; bg: string; border: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  progress: { fg: colors.primary, bg: colors.primarySoft, border: 'rgba(13,96,83,0.18)', icon: 'pulse' },
  done: { fg: colors.primary, bg: colors.primarySoft, border: 'rgba(13,96,83,0.18)', icon: 'checkmark-done-circle' },
  warn: { fg: colors.amber, bg: colors.amberSoft, border: 'rgba(217,119,6,0.25)', icon: 'alert-circle' },
};

/**
 * Live status of a guest's own report (no account, MOD-42): polled while open, with a
 * push opt-in. Every state is visible: checking, offline (last known), and no longer
 * followed. Never names anyone else who reported the same emergency.
 */
export function GuestReportStatusCard({ token, onExpired }: { token: string; onExpired?: () => void }) {
  const queryClient = useQueryClient();
  const [enabling, setEnabling] = useState(false);
  const [pushRefused, setPushRefused] = useState(false);

  const query = useQuery({
    queryKey: guestReportStatusKey(token),
    queryFn: () => fetchGuestReportStatus(token),
    refetchInterval: (q) => (q.state.data?.finished || isExpired(q.state.error) ? false : POLL_MS),
    retry: (count, err) => !isExpired(err) && count < 2,
    staleTime: 5_000,
  });
  const expired = isExpired(query.error);

  useEffect(() => {
    if (expired) onExpired?.();
  }, [expired]);

  async function turnOnUpdates() {
    setEnabling(true);
    const ok = await enableGuestReportPush(token, { requestPermission: true });
    setPushRefused(!ok);
    setEnabling(false);
    void queryClient.invalidateQueries({ queryKey: guestReportStatusKey(token) });
  }

  if (expired) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessible>
        <Ionicons name="time-outline" size={18} color={colors.textMid} />
        <Text style={styles.body}>
          This report can no longer be followed from this phone. If you still need help, call 911 or the MDRRMO hotline.
        </Text>
      </View>
    );
  }

  const data = query.data;
  if (!data) {
    const offline = !!query.error;
    return (
      <View style={[styles.card, offline ? warnBox : progressBox]} accessible accessibilityLiveRegion="polite">
        {offline
          ? <Ionicons name="cloud-offline-outline" size={18} color={colors.amber} />
          : <ActivityIndicator size="small" color={colors.primary} />}
        <Text style={styles.body}>
          {offline
            ? 'Can’t check the status right now (no connection). Your report was already received. We’ll keep trying.'
            : 'Checking your report status…'}
        </Text>
      </View>
    );
  }

  const text = guestStatusText(data.effectiveStatus);
  const tone = TONE[text.tone];
  const stale = !!query.error;

  return (
    <View
      style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Report status: ${text.title}. ${text.body}`}
    >
      <Ionicons name={tone.icon} size={20} color={tone.fg} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: tone.fg }]}>{text.title}</Text>
        <Text style={styles.body}>{text.body}</Text>
        {data.merged && <Text style={[styles.body, styles.note]}>{GUEST_MERGED_NOTE}</Text>}
        <Text style={styles.meta}>
          {stale ? `No connection. Last checked status from ${timeOf(data.updatedAt)}.` : `Updated ${timeOf(data.updatedAt)}`}
        </Text>

        {!data.finished && (data.pushEnabled ? (
          <View style={styles.pushRow}>
            <Ionicons name="notifications" size={14} color={colors.primary} />
            <Text style={styles.pushText}>You’ll get a notification when this changes.</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.pushBtn}
              onPress={turnOnUpdates}
              disabled={enabling}
              accessibilityRole="button"
              accessibilityHint="Asks for notification permission so updates reach you even when AGAP is closed."
            >
              {enabling
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="notifications-outline" size={16} color={colors.primary} />}
              <Text style={styles.pushBtnText}>Get notifications for this report</Text>
            </TouchableOpacity>
            {pushRefused && (
              <Text style={styles.meta}>
                Notifications are off for AGAP. Turn them on in your phone settings, or keep this screen open.
              </Text>
            )}
          </>
        ))}
      </View>
    </View>
  );
}

function isExpired(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 404);
}

const progressBox = { backgroundColor: colors.primarySoft, borderColor: 'rgba(13,96,83,0.18)' };
const warnBox = { backgroundColor: colors.amberSoft, borderColor: 'rgba(217,119,6,0.25)' };

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: radius.lg, borderWidth: 1, padding: 14, marginTop: 8, width: '100%',
  },
  title: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  body: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.textMid, lineHeight: 20 },
  note: { marginTop: 6 },
  meta: { fontSize: 12, fontWeight: '600', color: colors.textSub, marginTop: 6 },
  pushRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pushText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  pushBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, minHeight: 40,
    borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(13,96,83,0.35)', backgroundColor: colors.white,
  },
  pushBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
