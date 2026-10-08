import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, cardShadow, radius } from '../../theme/tokens';
import { IncidentTypeIcon } from './incident-type-icon';
import { IncidentStatusBadge } from './incident-status-badge';
import { typeMeta } from './incident-meta';
import { formatDateTime } from './format';
import type { IncidentSummary } from '../../services/api/incidents.api';

/**
 * One row in the incident history list: category glyph, title + reference,
 * date, location, a short description, and the current status badge. Tapping
 * the card opens the full detail screen.
 */
export function IncidentHistoryCard({
  incident,
  onPress,
}: {
  incident: IncidentSummary;
  onPress: () => void;
}) {
  const meta = typeMeta(incident.type);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label}, ${incident.reference}, ${incident.status}`}
    >
      <IncidentTypeIcon type={incident.type} size={44} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>{meta.label}</Text>
            <Text style={styles.reference}>{incident.reference}</Text>
          </View>
          <IncidentStatusBadge status={incident.status} />
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.textSub} />
          <Text style={styles.metaText} numberOfLines={1}>
            {formatDateTime(incident.reportedAt)}
          </Text>
        </View>

        {incident.address && (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.textSub} />
            <Text style={styles.metaText} numberOfLines={1}>{incident.address}</Text>
          </View>
        )}

        {incident.description && (
          <Text style={styles.description} numberOfLines={2}>{incident.description}</Text>
        )}
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.textSub} style={styles.chevron} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 14,
    marginBottom: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  body: { flex: 1, marginLeft: 12, minWidth: 0 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  reference: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.textSub },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.textMid },
  description: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: colors.textSub,
  },
  chevron: { alignSelf: 'center', marginLeft: 4 },
});
