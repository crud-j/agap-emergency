import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme/tokens';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import { useAccessibilityStore } from '@/src/stores/accessibility.store';

/**
 * Responder UI kit: the citizen app's design language (pearl background, one
 * deep-green accent, white 20 pt cards, grouped rows, quiet motion) packaged for
 * the responder screens so every tab looks like the same product.
 *
 * Shape rule: cards 20 (radius.xl), buttons 16 (radius.lg), chips and icon
 * tiles 12 (radius.md), status pills fully round.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Strong ease-out: entrances settle quickly and never ease in. */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export const responderCard: ViewStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  borderWidth: 1,
  borderColor: colors.border,
  shadowColor: '#8795A3',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 16,
  elevation: 4,
};

/* -------------------------------------------------------------------------- */
/*                                    MOTION                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fade + 12 pt rise when a tab screen mounts (the citizen home does the same).
 * Reduce Motion: shown at once, no movement.
 */
export function useScreenEntrance() {
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      easing: EASE_OUT,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [reducedMotion, progress]);

  return {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };
}

/**
 * A pressable that scales to 0.97 on press-in (120 ms) and springs back: the
 * feedback the citizen tiles and buttons give. Use for cards and buttons, not rows.
 */
export function PressScale({
  style,
  wrapStyle,
  children,
  disabled,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  /** Visual style (background, padding, radius): scales with the press. */
  style?: StyleProp<ViewStyle>;
  /** Layout of the touch target in its parent (e.g. flex: 1 in a row). */
  wrapStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);
  const scale = useRef(new Animated.Value(1)).current;

  const to = (value: number, duration: number) => {
    if (reducedMotion) return;
    Animated.timing(scale, { toValue: value, duration, easing: EASE_OUT, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      {...rest}
      style={wrapStyle}
      disabled={disabled}
      onPressIn={(e) => {
        to(0.97, 120);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1, 180);
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   TOP BAR                                  */
/* -------------------------------------------------------------------------- */

const BRAND_ICON_STYLE: ImageStyle = { width: 40, height: 40, marginRight: 8 };

/** The AGAP mark with the surface name, matching the citizen home header. */
export function ResponderBrand() {
  return (
    <View style={styles.brand} accessibilityRole="header" accessibilityLabel="AGAP Responder">
      <Image source={require('@/assets/icons/agap-solo-icon.png')} style={BRAND_ICON_STYLE} resizeMode="contain" />
      <View>
        <Text style={styles.brandName}>AGAP</Text>
        <Text style={styles.brandSub}>Responder</Text>
      </View>
    </View>
  );
}

/** Online / offline indicator. Every connectivity state is visible (reliability rule). */
export function ConnectionPill() {
  const { isOnline } = useNetworkStatus();
  return (
    <View
      style={[styles.connPill, isOnline ? styles.connOnline : styles.connOffline]}
      accessibilityLabel={isOnline ? 'Connected' : 'Offline'}
    >
      <View style={[styles.connDot, { backgroundColor: isOnline ? colors.primary : colors.danger }]} />
      <Text style={[styles.connText, { color: isOnline ? colors.primary : colors.dangerStrong }]}>
        {isOnline ? 'Connected' : 'Offline'}
      </Text>
    </View>
  );
}

export function InitialsAvatar({ name, size = 40 }: { name?: string | null; size?: number }) {
  const initials =
    (name ?? 'R')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'R';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: Math.round(size * 0.36) }]}>{initials}</Text>
    </View>
  );
}

/** Tab-screen header: brand on the left; connection + avatar (or a custom slot) on the right. */
export function ResponderTopBar({ name, right }: { name?: string | null; right?: React.ReactNode }) {
  return (
    <View style={styles.topBar}>
      <ResponderBrand />
      <View style={styles.topRight}>
        {right}
        <ConnectionPill />
        <InitialsAvatar name={name} size={38} />
      </View>
    </View>
  );
}

/** Large page title under the top bar, with an optional right-side action. */
export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.pageTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pageTitle} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.pageSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                               SECTIONS & ROWS                              */
/* -------------------------------------------------------------------------- */

export function SectionLabel({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={actionLabel}>
          {({ pressed }) => (
            <Text style={[styles.sectionAction, pressed && { opacity: 0.5 }]}>{actionLabel}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/** White grouped container for ListRows (citizen profile pattern). */
export function ListGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.group, style]}>{children}</View>;
}

export function ListRow({
  icon,
  label,
  sub,
  value,
  tone = 'primary',
  last,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  value?: string;
  tone?: 'primary' | 'danger';
  last?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const fg = tone === 'danger' ? colors.dangerStrong : colors.primary;
  const bg = tone === 'danger' ? colors.dangerSoft : colors.primarySoft;
  const body = (pressed: boolean) => (
    <View style={[styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}>
      <View style={[styles.rowIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={19} color={fg} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, tone === 'danger' && { color: fg }]}>{label}</Text>
        {sub ? <Text style={styles.rowSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color="#C4C9D1" /> : null}
    </View>
  );

  if (!onPress) return body(false);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*                                STATE PANELS                                */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'primary' | 'amber' | 'danger';

const TONE: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.surface },
  primary: { fg: colors.primary, bg: colors.primarySoft },
  amber: { fg: colors.amberText, bg: colors.amberSoft },
  danger: { fg: colors.dangerStrong, bg: colors.dangerSoft },
};

export function toneColors(tone: Tone) {
  return TONE[tone];
}

/** Composed empty / error state: icon, title, what to do next, optional action. */
export function StatePanel({
  icon,
  tone = 'neutral',
  title,
  body,
  actionLabel,
  actionIcon,
  onAction,
}: {
  icon: IconName;
  tone?: Tone;
  title: string;
  body?: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
}) {
  const c = TONE[tone];
  return (
    <View style={styles.statePanel}>
      <View style={[styles.stateIcon, { backgroundColor: c.bg }]}>
        <Ionicons name={icon} size={30} color={c.fg} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {body ? <Text style={styles.stateBody}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <PressScale style={styles.stateBtn} onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
          {actionIcon ? <Ionicons name={actionIcon} size={17} color={colors.white} /> : null}
          <Text style={styles.stateBtnText}>{actionLabel}</Text>
        </PressScale>
      ) : null}
    </View>
  );
}

/** Inline notice (offline, stale, permission). Tone carries the meaning; text says what to do. */
export function Notice({
  icon,
  tone,
  text,
  actionLabel,
  onAction,
  style,
}: {
  icon: IconName;
  tone: Exclude<Tone, 'primary'> | 'primary';
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = TONE[tone];
  return (
    <View style={[styles.notice, { backgroundColor: c.bg }, style]} accessibilityRole="alert">
      <Ionicons name={icon} size={16} color={c.fg} />
      <Text style={[styles.noticeText, { color: c.fg }]}>{text}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={styles.noticeAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Skeleton({ height = 14, width = '100%', style }: {
  height?: number;
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ height, width, borderRadius: 7, backgroundColor: '#E4EAF0' }, style]} />;
}

/* -------------------------------------------------------------------------- */
/*                                    STYLES                                  */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  brandName: { fontSize: 20, lineHeight: 22, fontWeight: '900', letterSpacing: 0.8, color: colors.text },
  brandSub: { fontSize: 10, lineHeight: 13, fontWeight: '700', letterSpacing: 0.4, color: colors.textMuted, textTransform: 'uppercase' },

  topBar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  connPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderRadius: 15 },
  connOnline: { backgroundColor: colors.primarySoft },
  connOffline: { backgroundColor: colors.dangerSoft },
  connDot: { width: 7, height: 7, borderRadius: 4 },
  connText: { fontSize: 12, fontWeight: '700' },
  avatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarText: { color: colors.white, fontWeight: '800' },

  pageTitleRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, marginBottom: 16, gap: 12 },
  pageTitle: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  pageSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10, minHeight: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  sectionAction: { fontSize: 14, fontWeight: '700', color: colors.primary },

  group: { ...responderCard, padding: 0, overflow: 'hidden', marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, minHeight: 60 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#EEF2F0' },
  rowPressed: { backgroundColor: colors.bg },
  rowIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  rowValue: { fontSize: 13, fontWeight: '700', color: colors.textMid, marginRight: 6 },

  statePanel: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 36 },
  stateIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  stateTitle: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center', marginTop: 6, maxWidth: 300 },
  stateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, paddingHorizontal: 22, marginTop: 18, borderRadius: radius.lg, backgroundColor: colors.primary,
  },
  stateBtnText: { color: colors.white, fontSize: 15, fontWeight: '800' },

  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  noticeAction: { fontSize: 13, fontWeight: '800', color: colors.primary },
});
