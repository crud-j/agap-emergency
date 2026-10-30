import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { openGoogleMapsSearch, promptNavigation } from '@/src/services/navigation/external-nav';

/**
 * Hand-off to the crew's preferred nav app (Waze / Google / Apple) routed to the
 * incident, or to the hospital during transport (MOD-32 / plan §13.1). Since AGAP
 * draws the route in-app, this is typically a *secondary* action for voice
 * turn-by-turn while driving. Disables itself when there is nothing to navigate
 * to — navigation must never block the workflow. `searchQuery` replaces the
 * coordinates with a Google Maps name search (a hospital whose location is not
 * verified), with `warning` shown under the button.
 */
export function NavigateButton({
  lat,
  lng,
  label,
  caption,
  title,
  searchQuery,
  warning,
  variant = 'primary',
  style,
}: {
  lat?: number | null;
  lng?: number | null;
  label?: string;
  caption?: string;
  /** Title of the nav-app chooser. */
  title?: string;
  searchQuery?: string | null;
  warning?: string | null;
  variant?: 'primary' | 'secondary';
  style?: ViewStyle;
}) {
  const noCoords = lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng);
  const disabled = !searchQuery && noCoords;
  const secondary = variant === 'secondary';
  const tint = secondary ? '#0D6053' : '#FFFFFF';

  return (
    <View style={style}>
      <TouchableOpacity
        style={[
          styles.btn,
          secondary ? styles.btnSecondary : styles.btnPrimary,
          disabled && styles.btnDisabled,
        ]}
        disabled={disabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={caption ?? 'Open navigation app'}
        onPress={() => {
          if (searchQuery) void openGoogleMapsSearch(searchQuery);
          else if (!disabled) promptNavigation({ lat: lat as number, lng: lng as number, label, title });
        }}
      >
        <Ionicons name="navigate" size={18} color={disabled ? '#8795A3' : tint} style={{ marginRight: 8 }} />
        <Text style={[styles.text, { color: disabled ? '#8795A3' : tint }]} numberOfLines={1}>
          {disabled ? 'Location unavailable' : caption ?? 'Navigate to Scene'}
        </Text>
      </TouchableOpacity>
      {!!warning && (
        <View style={styles.warnRow}>
          <Ionicons name="warning" size={14} color="#D97706" style={{ marginRight: 6 }} />
          <Text style={styles.warnText}>{warning}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  btnPrimary: { backgroundColor: '#0D6053' },
  btnSecondary: { backgroundColor: '#EEF7F4', borderWidth: 1, borderColor: 'rgba(13,96,83,0.20)' },
  btnDisabled: { backgroundColor: '#EDF1F4', borderColor: 'rgba(168,181,193,0.20)' },
  text: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  warnRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6, paddingHorizontal: 4 },
  warnText: { flex: 1, fontSize: 12, color: '#D97706', lineHeight: 17 },
});

export default NavigateButton;
