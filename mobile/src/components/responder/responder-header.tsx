import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AgapLogo } from '@/src/components/brand/AgapLogo';
import { colors } from '@/src/theme/tokens';

/**
 * Shared responder app bar — mirrors the citizen app bar (back · AGAP wordmark ·
 * right slot) on the pearl background with the fine bevel line underneath.
 * Render it inside a SafeAreaView / below the status bar inset.
 */
export function ResponderHeader({
  onBack,
  right,
  title,
  subtitle,
}: {
  onBack?: () => void;
  right?: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <View>
      <View style={styles.bar}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        <AgapLogo />
        <View style={styles.right}>{right}</View>
      </View>
      {title ? (
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  right: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleBlock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSub, marginTop: 2 },
});

export default ResponderHeader;
