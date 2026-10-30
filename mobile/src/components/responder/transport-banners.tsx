import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslations } from '@/src/hooks/useAccessibility';
import type { RouteTarget } from '@/src/lib/transport-target';
import type { OutboxDrop } from '@/src/services/offline/transport-outbox';
import { colors, radius } from '@/src/theme/tokens';

/**
 * Transport connectivity and trust indicators (plan §15 item 7, Rule "never fail
 * silently"), shared by the assignment screen and the Map tab:
 * - the hospital was deactivated mid-transport (plan §12; the transport continues);
 * - the route shown is the last known one (stale or older than 120 s);
 * - the hospital's location is not verified (or it has no coordinates);
 * - keep AGAP open: location is shared from the foreground only.
 */
export function TransportBanners({
  transporting,
  target,
  routeLastKnown,
  destinationDeactivated,
}: {
  /** This crew's transport is open (not arrived). */
  transporting: boolean;
  target: RouteTarget;
  routeLastKnown: boolean;
  /** useTransportRoute().destinationDeactivated */
  destinationDeactivated: boolean;
}) {
  const t = useTranslations().transport;
  const unverified = transporting && !!target.label && !target.verified;
  return (
    <>
      {destinationDeactivated && <Banner icon="close-circle-outline" text={t.destinationDeactivated} />}
      {routeLastKnown && <Banner icon="cloud-offline" text={t.routeLastKnown} />}
      {unverified && <Banner icon="warning" text={t.locationNotVerified} />}
      {transporting && <Banner icon="phone-portrait-outline" text={t.keepAppOpen} tone="info" />}
    </>
  );
}

/**
 * The transport outbox (plan §19): actions saved on this phone and waiting to send,
 * and any the server refused (with its reason, until the crew dismisses it).
 */
export function OutboxBanner({
  pending,
  drops,
  onSendNow,
  onDismiss,
}: {
  pending: number;
  drops: OutboxDrop[];
  onSendNow: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations().transport;
  return (
    <>
      {pending > 0 && (
        <View style={styles.row} accessibilityRole="alert">
          <Ionicons name="cloud-upload-outline" size={14} color={colors.amber} style={{ marginRight: 6 }} />
          <Text style={[styles.text, { color: colors.amber }]}>
            {`${t.savedOnPhone}\n${t.pendingCount(pending)}`}
          </Text>
          <TouchableOpacity onPress={onSendNow} accessibilityRole="button" style={styles.action}>
            <Text style={[styles.actionText, { color: colors.amber }]}>{t.sendNow}</Text>
          </TouchableOpacity>
        </View>
      )}
      {drops.map((drop) => (
        <View key={drop.clientRequestId} style={[styles.row, styles.error]} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={14} color={colors.danger} style={{ marginRight: 6 }} />
          <Text style={[styles.text, { color: colors.danger }]}>{t.notSent(drop.message)}</Text>
        </View>
      ))}
      {drops.length > 0 && (
        <TouchableOpacity onPress={onDismiss} accessibilityRole="button" style={styles.dismiss}>
          <Text style={[styles.actionText, { color: colors.danger }]}>{t.dismiss}</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

function Banner({
  icon,
  text,
  tone = 'warn',
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
  tone?: 'warn' | 'info';
}) {
  const fg = tone === 'warn' ? colors.amber : colors.primary;
  return (
    <View style={[styles.row, tone === 'info' && styles.info]} accessibilityRole="alert">
      <Ionicons name={icon} size={14} color={fg} style={{ marginRight: 6 }} />
      <Text style={[styles.text, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, padding: 10,
    borderRadius: radius.md, backgroundColor: colors.amberSoft,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.20)',
  },
  info: { backgroundColor: colors.primarySoft, borderColor: 'rgba(13,96,83,0.18)' },
  text: { fontSize: 12, flex: 1, lineHeight: 17 },
  error: { backgroundColor: colors.dangerSoft, borderColor: 'rgba(212,72,88,0.20)' },
  action: { marginLeft: 8, paddingHorizontal: 4 },
  actionText: { fontSize: 12, fontWeight: '700' },
  dismiss: { alignSelf: 'flex-end', marginTop: 4, paddingHorizontal: 4, paddingVertical: 2 },
});
