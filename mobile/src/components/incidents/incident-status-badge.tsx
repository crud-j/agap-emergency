import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { statusMeta, TONE_COLORS } from './incident-meta';

/**
 * Status pill (Resolved / Closed / Canceled / En Route …). Colour tone is
 * derived from the status group so terminal-positive, terminal-negative, and
 * in-progress states read differently at a glance.
 */
export function IncidentStatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  const tone = TONE_COLORS[meta.tone];

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Ionicons name={meta.icon} size={12} color={tone.fg} style={styles.icon} />
      <Text style={[styles.label, { color: tone.fg }]} numberOfLines={1}>
        {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  icon: { marginRight: 4 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
});
