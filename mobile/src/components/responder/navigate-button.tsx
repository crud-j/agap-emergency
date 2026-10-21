import React from 'react';
import { Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { promptNavigation } from '@/src/services/navigation/external-nav';

/**
 * Hand-off to the crew's preferred nav app (Waze / Google / Apple) routed to the
 * incident (MOD-32). Since AGAP now draws the route in-app, this is typically a
 * *secondary* action for voice turn-by-turn while driving. Disables itself when
 * the incident has no coordinates — navigation must never block the workflow.
 */
export function NavigateButton({
  lat,
  lng,
  label,
  caption,
  variant = 'primary',
  style,
}: {
  lat?: number | null;
  lng?: number | null;
  label?: string;
  caption?: string;
  variant?: 'primary' | 'secondary';
  style?: ViewStyle;
}) {
  const disabled = lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng);
  const secondary = variant === 'secondary';
  const tint = secondary ? '#0D6053' : '#FFFFFF';

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        secondary ? styles.btnSecondary : styles.btnPrimary,
        disabled && styles.btnDisabled,
        style,
      ]}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Open navigation app"
      onPress={() => {
        if (!disabled) promptNavigation({ lat: lat as number, lng: lng as number, label });
      }}
    >
      <Ionicons name="navigate" size={18} color={disabled ? '#8795A3' : tint} style={{ marginRight: 8 }} />
      <Text style={[styles.text, { color: disabled ? '#8795A3' : tint }]}>
        {disabled ? 'Location unavailable' : caption ?? 'Navigate to Scene'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 14,
  },
  btnPrimary: { backgroundColor: '#0D6053' },
  btnSecondary: { backgroundColor: '#EEF7F4', borderWidth: 1, borderColor: 'rgba(13,96,83,0.20)' },
  btnDisabled: { backgroundColor: '#EDF1F4', borderColor: 'rgba(168,181,193,0.20)' },
  text: { fontSize: 15, fontWeight: '700' },
});

export default NavigateButton;
