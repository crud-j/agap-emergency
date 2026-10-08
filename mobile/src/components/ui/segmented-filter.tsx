import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../../theme/tokens';

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
}

/**
 * Horizontal pill selector (All / Ongoing / Resolved / Canceled). Single-select.
 * Scrolls horizontally so additional segments never wrap or clip on small
 * screens. The active pill fills with the deep-green primary.
 */
export function SegmentedFilter<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.pill, active ? styles.pillActive : styles.pillIdle]}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
          >
            <Text style={[styles.label, active ? styles.labelActive : styles.labelIdle]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 8 },
  pill: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillIdle: { backgroundColor: colors.white, borderColor: colors.border },
  label: { fontSize: 13, fontWeight: '700' },
  labelActive: { color: colors.white },
  labelIdle: { color: colors.textMid },
});
