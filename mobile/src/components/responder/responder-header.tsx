import React from 'react';
import { View, Text, Pressable, StyleSheet, Image, type ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/tokens';

const MARK_STYLE: ImageStyle = { width: 34, height: 34 };

/**
 * Responder app bar for operational screens (map, mission, field forms).
 * With `onBack`: back button · title + subtitle · right slot, like the citizen
 * ScreenHeader. Without it (the Map tab): the AGAP mark takes the back button's
 * place. Render it inside a SafeAreaView / below the status bar inset.
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
    <View style={styles.bar}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={6}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
      ) : (
        <Image
          source={require('@/assets/icons/agap-solo-icon.png')}
          style={MARK_STYLE}
          resizeMode="contain"
          accessibilityLabel="AGAP"
        />
      )}
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title ?? 'AGAP Responder'}
        </Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 1, fontVariant: ['tabular-nums'] },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

export default ResponderHeader;
