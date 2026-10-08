import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typeMeta } from './incident-meta';

/**
 * Circular category glyph used in the history list and detail header. Colour
 * and icon come from the shared TYPE_META so a category always looks the same.
 */
export function IncidentTypeIcon({ type, size = 48 }: { type: string; size?: number }) {
  const meta = typeMeta(type);
  const iconSize = Math.round(size * 0.46);

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: meta.soft },
      ]}
    >
      <Ionicons name={meta.icon} size={iconSize} color={meta.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
