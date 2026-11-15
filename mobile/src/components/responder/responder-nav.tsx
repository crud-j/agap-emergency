import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { colors } from '@/src/theme/tokens';
import { useAccessibilityStore } from '@/src/stores/accessibility.store';
import { useResponderAssignments } from '@/src/hooks/useResponderAssignments';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: Array<{ route: string; label: string; icon: IconName; iconActive: IconName }> = [
  { route: '/responder/home',        label: 'Home',     icon: 'home-outline',      iconActive: 'home' },
  { route: '/responder/assignments', label: 'Missions', icon: 'clipboard-outline', iconActive: 'clipboard' },
  { route: '/responder/map',         label: 'Map',      icon: 'map-outline',       iconActive: 'map' },
  { route: '/responder/profile',     label: 'Profile',  icon: 'person-outline',    iconActive: 'person' },
];

const GUTTER = 16;
const BAR_H = 68;
const BAR_PAD = 6;
const BLOB_H = 54;

// Same liquid motion as the citizen bar: the leading edge stretches toward the
// new tab, then the trailing edge settles in after it.
const STRETCH = { duration: 160, easing: Easing.bezier(0.55, 0, 0.3, 1) };
const SETTLE = { duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1) };
const BLOB_SQUASH = 0.84;

/**
 * Responder shell tab bar: a floating white pill with a sliding brand-green
 * indicator, matching the citizen BottomNav. Mounted once by the responder
 * layout, so the indicator simply animates between slots. It stays in the
 * layout flow (not absolute) so no screen content is ever hidden behind it.
 */
export function ResponderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);
  // Same query the screens use (shared cache): a dot on Missions while an offer waits.
  const { pendingOffers } = useResponderAssignments();

  const current = TABS.findIndex((t) => t.route === pathname);
  const slotW = (width - GUTTER * 2 - BAR_PAD * 2) / TABS.length;

  const lastSlot = useRef(current < 0 ? 0 : current);
  const left = useRef(new Animated.Value(lastSlot.current * slotW)).current;
  const right = useRef(new Animated.Value((lastSlot.current + 1) * slotW)).current;
  const squash = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (current < 0) return;
    const from = lastSlot.current;
    lastSlot.current = current;
    const toL = current * slotW;
    const toR = (current + 1) * slotW;

    if (from === current || reducedMotion) {
      left.setValue(toL);
      right.setValue(toR);
      squash.setValue(1);
      return;
    }

    const movingRight = current > from;
    const lead = movingRight ? right : left;
    const trail = movingRight ? left : right;
    const run = (v: Animated.Value, toValue: number, cfg: typeof STRETCH) =>
      Animated.timing(v, { toValue, ...cfg, useNativeDriver: true });

    const anim = Animated.sequence([
      Animated.parallel([run(lead, movingRight ? toR : toL, STRETCH), run(squash, BLOB_SQUASH, STRETCH)]),
      Animated.parallel([run(trail, movingRight ? toL : toR, SETTLE), run(squash, 1, SETTLE)]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [current, slotW, reducedMotion]);

  const blobX = Animated.add(Animated.multiply(Animated.add(left, right), 0.5), -slotW / 2);
  const blobScaleX = Animated.multiply(Animated.subtract(right, left), 1 / slotW);

  const go = (route: string) => {
    if (pathname === route) return;
    if (!reducedMotion) Haptics.selectionAsync().catch(() => undefined);
    router.replace(route as never);
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        <Animated.View
          pointerEvents="none"
          style={[
            styles.blob,
            {
              width: slotW,
              opacity: current < 0 ? 0 : 1,
              transform: [{ translateX: blobX }, { scaleX: blobScaleX }, { scaleY: squash }],
            },
          ]}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryBright]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.blobFill}
          />
        </Animated.View>

        {TABS.map((tab, i) => (
          <TabItem
            key={tab.route}
            label={tab.label}
            icon={tab.icon}
            iconActive={tab.iconActive}
            active={current === i}
            badge={tab.route === '/responder/assignments' && pendingOffers.length > 0}
            reducedMotion={reducedMotion}
            onPress={() => go(tab.route)}
          />
        ))}
      </View>
    </View>
  );
}

function TabItem({
  label,
  icon,
  iconActive,
  active,
  badge,
  reducedMotion,
  onPress,
}: {
  label: string;
  icon: IconName;
  iconActive: IconName;
  active: boolean;
  badge: boolean;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // The colour flips just after the indicator starts arriving.
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      delay: reducedMotion ? 0 : 80,
      duration: reducedMotion ? 0 : 240,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [active, reducedMotion]);

  const press = (toValue: number) =>
    reducedMotion
      ? pressScale.setValue(1)
      : Animated.spring(pressScale, { toValue, tension: 320, friction: 18, useNativeDriver: true }).start();

  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      onPressIn={() => press(0.92)}
      onPressOut={() => press(1)}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge ? `${label}, offer waiting` : label}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale: pressScale }] }]}>
        {/* Two stacked faces cross-fade so the colour change runs on the native driver. */}
        <Animated.View style={[styles.face, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
          <Ionicons name={icon} size={22} color={INACTIVE} />
          <Text numberOfLines={1} style={[styles.label, { color: INACTIVE }]}>{label}</Text>
        </Animated.View>
        <Animated.View style={[styles.face, { opacity: progress }]}>
          <Ionicons name={iconActive} size={22} color={colors.white} />
          <Text numberOfLines={1} style={[styles.label, styles.labelActive]}>{label}</Text>
        </Animated.View>
        {badge ? <View style={styles.badge} /> : null}
      </Animated.View>
    </Pressable>
  );
}

const INACTIVE = '#52647A';

const styles = StyleSheet.create({
  container: { paddingHorizontal: GUTTER, paddingTop: 8, backgroundColor: 'transparent' },
  bar: {
    height: BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BAR_PAD,
    borderRadius: BAR_H / 2,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E9ECEB',
    ...Platform.select({
      ios: { shadowColor: '#18231F', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 7 } },
      android: { elevation: 9 },
    }),
  },
  blob: {
    position: 'absolute',
    left: BAR_PAD,
    top: (BAR_H - BLOB_H) / 2,
    height: BLOB_H,
    borderRadius: BLOB_H / 2,
    ...Platform.select({
      ios: { shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 4 },
    }),
  },
  blobFill: { flex: 1, borderRadius: BLOB_H / 2 },
  tab: { flex: 1, height: BLOB_H, minWidth: 0 },
  tabInner: { flex: 1 },
  face: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  label: { marginTop: 2, fontSize: 11, fontWeight: '600', letterSpacing: -0.1 },
  labelActive: { color: colors.white, fontWeight: '800' },
  badge: {
    position: 'absolute', top: 8, right: '28%',
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.white,
  },
});
