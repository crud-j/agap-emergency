import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Linking,
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
import { useTranslations } from '../../hooks/useAccessibility';
import { useAccessibilityStore } from '../../stores/accessibility.store';
import { useIncidentStore } from '../../stores/incident.store';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type LabelKey = 'tabHome' | 'tabIncidents' | 'tabAnnouncements' | 'tabProfile';

interface TabDef {
  route: string;
  labelKey: LabelKey;
  icon: IconName;
  iconActive: IconName;
  /** Position in the five-slot row. Slot 2 is reserved for the + button. */
  slot: number;
}

/* -------------------------------------------------------------------------- */
/*                                  TAB DATA                                  */
/* -------------------------------------------------------------------------- */

const TABS: TabDef[] = [
  { route: '/home', labelKey: 'tabHome', icon: 'home-outline', iconActive: 'home', slot: 0 },
  {
    route: '/incidents',
    labelKey: 'tabIncidents',
    icon: 'document-text-outline',
    iconActive: 'document-text',
    slot: 1,
  },
  {
    route: '/announcements',
    labelKey: 'tabAnnouncements',
    icon: 'megaphone-outline',
    iconActive: 'megaphone',
    slot: 3,
  },
  { route: '/profile', labelKey: 'tabProfile', icon: 'person-outline', iconActive: 'person', slot: 4 },
];

const SLOT_COUNT = 5;
const CENTER_SLOT = 2;

/* -------------------------------------------------------------------------- */
/*                               COLORS & SIZES                               */
/* -------------------------------------------------------------------------- */

const COLORS = {
  white: '#FFFFFF',
  primary: '#0D6053',
  primaryBright: '#17917C',
  primarySoft: '#E6F4F1',
  navy: '#1F4E79',
  navySoft: '#E7EEF6',
  surface: '#F6F8FA',
  muted: '#66768A',
  inactive: '#52647A',
  ink: '#1D2B3A',
  border: '#E9ECEB',
  danger: '#E5484D',
  dangerDeep: '#B4232A',
  backdrop: 'rgba(7, 24, 21, 0.48)',
};

const SIDE_GUTTER = 16;
const BAR_H = 72;
const BAR_PAD = 6;
const BLOB_H = 56;
const FAB = 62;
// How far the + button's centre sits above the bar's centre.
const FAB_RAISE = 18;

// Quick-action panel that rises above the + button.
const PANEL_MAX_W = 380;
const PANEL_GAP = 16;
const NOTCH = 16;

// Bocaue MDRRMO hotline. AGAP complements the hotline, never replaces it.
const MDRRMO_HOTLINE = '09363309020';
const MDRRMO_HOTLINE_DISPLAY = '0936 330 9020';

/* -------------------------------------------------------------------------- */
/*                                   MOTION                                   */
/* -------------------------------------------------------------------------- */

// Liquid blob: the leading edge stretches toward the target, then the trailing
// edge springs in after it with a slight overshoot.
const STRETCH = { duration: 160, easing: Easing.bezier(0.55, 0, 0.3, 1) };
const SETTLE = { duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1) };
const BLOB_SQUASH = 0.82;

// Each tab screen mounts its own BottomNav (tabs swap with animation: 'none'),
// so remember where the blob was to let the next screen's nav continue the move.
let lastSlot: number | null = null;

function selectedTabSlot(pathname: string): number | null {
  const tab = TABS.find((item) => pathname === item.route || pathname.startsWith(`${item.route}/`));
  if (tab) return tab.slot;
  if (pathname === '/history' || pathname.startsWith('/history/')) return 1;
  if (pathname === '/archive' || pathname.startsWith('/archive/')) return 4;
  return null;
}

/* -------------------------------------------------------------------------- */
/*                               BOTTOM NAVIGATION                            */
/* -------------------------------------------------------------------------- */

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const t = useTranslations();
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);

  const [menuOpen, setMenuOpen] = useState(false);

  const current = selectedTabSlot(pathname);

  // Where the blob starts on this mount: the previous screen's tab, if any.
  const arrivingFrom = useRef(lastSlot).current;
  const startSlot = arrivingFrom ?? current ?? 0;

  const barW = width - SIDE_GUTTER * 2;
  const slotW = (barW - BAR_PAD * 2) / SLOT_COUNT;
  const bottomSpacing = Math.max(insets.bottom + 8, 22);

  /* ------------------------------ BLOB STATE ------------------------------ */

  const left = useRef(new Animated.Value(startSlot * slotW)).current;
  const right = useRef(new Animated.Value((startSlot + 1) * slotW)).current;
  const squash = useRef(new Animated.Value(1)).current;
  const blobOpacity = useRef(new Animated.Value(current === null ? 0 : 1)).current;
  const blobAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    blobAnim.current?.stop();

    if (current === null) {
      const fade = Animated.timing(blobOpacity, { toValue: 0, duration: 150, useNativeDriver: true });
      fade.start();
      return () => fade.stop();
    }
    blobOpacity.setValue(1);

    const from = lastSlot ?? current;
    lastSlot = current;

    const toL = current * slotW;
    const toR = (current + 1) * slotW;

    if (from === current || reducedMotion) {
      left.setValue(toL);
      right.setValue(toR);
      squash.setValue(1);
      return () => blobAnim.current?.stop();
    }

    const movingRight = current > from;
    const lead = movingRight ? right : left;
    const trail = movingRight ? left : right;

    const run = (value: Animated.Value, toValue: number, cfg: typeof STRETCH) =>
      Animated.timing(value, { toValue, ...cfg, useNativeDriver: true });

    blobAnim.current = Animated.sequence([
      Animated.parallel([
        run(lead, movingRight ? toR : toL, STRETCH),
        run(squash, BLOB_SQUASH, STRETCH),
      ]),
      Animated.parallel([
        run(trail, movingRight ? toL : toR, SETTLE),
        run(squash, 1, SETTLE),
      ]),
    ]);
    blobAnim.current.start();
    return () => blobAnim.current?.stop();
  }, [current, slotW, reducedMotion]);

  // Edges → centre translate + horizontal stretch (native-driver friendly).
  const blobTranslateX = Animated.add(
    Animated.multiply(Animated.add(left, right), 0.5),
    -slotW / 2,
  );
  const blobScaleX = Animated.multiply(Animated.subtract(right, left), 1 / slotW);

  /* ------------------------------ NAVIGATION ------------------------------ */

  const go = (route: string) => {
    setMenuOpen(false);
    if (!reducedMotion) {
      Haptics.selectionAsync().catch(() => undefined);
    }
    if (pathname !== route) router.replace(route as never);
  };

  const toggleMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setMenuOpen((open) => !open);
  };

  const fabCenterFromBottom = bottomSpacing + BAR_H / 2 + FAB_RAISE;

  return (
    <View pointerEvents="box-none" style={styles.container}>
      {/* ------------------------------------------------------------------ */}
      {/* BAR                                                                */}
      {/* ------------------------------------------------------------------ */}

      <View style={[styles.bar, { bottom: bottomSpacing }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.blob,
            {
              width: slotW,
              opacity: blobOpacity,
              transform: [
                { translateX: blobTranslateX },
                { scaleX: blobScaleX },
                { scaleY: squash },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryBright]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.blobFill}
          />
        </Animated.View>

        {Array.from({ length: SLOT_COUNT }, (_, slot) => {
          if (slot === CENTER_SLOT) return <View key="center" style={styles.tab} />;
          const tab = TABS.find((x) => x.slot === slot)!;
          return (
            <TabItem
              key={tab.route}
              tab={tab}
              label={t.home[tab.labelKey]}
              active={current === slot}
              startActive={(arrivingFrom ?? current) === slot}
              reducedMotion={reducedMotion}
              onPress={() => go(tab.route)}
            />
          );
        })}
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* QUICK ACTIONS                                                      */}
      {/* ------------------------------------------------------------------ */}

      <QuickActionsMenu
        open={menuOpen}
        reducedMotion={reducedMotion}
        panelWidth={Math.min(barW, PANEL_MAX_W)}
        centerX={width / 2}
        panelBottom={fabCenterFromBottom + FAB / 2 + PANEL_GAP}
        onClose={() => setMenuOpen(false)}
        onNavigate={(route) => {
          setMenuOpen(false);
          router.push(route as never);
        }}
      />

      <CenterButton
        open={menuOpen}
        label={t.home.navQuickActions}
        reducedMotion={reducedMotion}
        onPress={toggleMenu}
        style={{ left: width / 2 - FAB / 2, bottom: fabCenterFromBottom - FAB / 2 }}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  TAB ITEM                                  */
/* -------------------------------------------------------------------------- */

function TabItem({
  tab,
  label,
  active,
  startActive,
  reducedMotion,
  onPress,
}: {
  tab: TabDef;
  label: string;
  active: boolean;
  startActive: boolean;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const progress = useRef(new Animated.Value(startActive ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Colour flips just after the blob starts arriving, like the reference.
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      delay: reducedMotion ? 0 : 80,
      duration: reducedMotion ? 0 : 250,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [active, reducedMotion]);

  const press = (toValue: number) =>
    reducedMotion
      ? pressScale.setValue(1)
      : Animated.spring(pressScale, { toValue, tension: 320, friction: 18, useNativeDriver: true }).start();

  const inactiveOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Pressable
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => press(0.92)}
      onPressOut={() => press(1)}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale: pressScale }] }]}>
        {/* Two stacked layers cross-fade so the colour change runs on the native driver. */}
        <Animated.View style={[styles.tabLayer, { opacity: inactiveOpacity }]}>
          <TabFace icon={tab.icon} label={label} color={COLORS.inactive} />
        </Animated.View>
        <Animated.View style={[styles.tabLayer, { opacity: progress }]}>
          <TabFace icon={tab.iconActive} label={label} color={COLORS.white} bold />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function TabFace({
  icon,
  label,
  color,
  bold = false,
}: {
  icon: IconName;
  label: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <>
      <Ionicons name={icon} size={23} color={color} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[styles.label, { color, fontWeight: bold ? '700' : '500' }]}
      >
        {label}
      </Text>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 + BUTTON                                   */
/* -------------------------------------------------------------------------- */

function CenterButton({
  open,
  label,
  reducedMotion,
  onPress,
  style,
}: {
  open: boolean;
  label: string;
  reducedMotion: boolean;
  onPress: () => void;
  style: { left: number; bottom: number };
}) {
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      turn.setValue(open ? 1 : 0);
      return;
    }
    Animated.spring(turn, {
      toValue: open ? 1 : 0,
      tension: 220,
      friction: 16,
      useNativeDriver: true,
    }).start();
  }, [open, reducedMotion]);

  const press = (toValue: number) =>
    reducedMotion
      ? pressScale.setValue(1)
      : Animated.spring(pressScale, { toValue, tension: 320, friction: 16, useNativeDriver: true }).start();

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] });

  return (
    <Animated.View style={[styles.fabWrap, style, { transform: [{ scale: pressScale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        onPressIn={() => press(0.9)}
        onPressOut={() => press(1)}
        style={styles.fabRing}
      >
        <LinearGradient
          colors={[COLORS.primaryBright, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="add" size={34} color={COLORS.white} />
          </Animated.View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/*                             QUICK ACTIONS MENU                             */
/* -------------------------------------------------------------------------- */

function QuickActionsMenu({
  open,
  reducedMotion,
  panelWidth,
  centerX,
  panelBottom,
  onClose,
  onNavigate,
}: {
  open: boolean;
  reducedMotion: boolean;
  panelWidth: number;
  centerX: number;
  panelBottom: number;
  onClose: () => void;
  onNavigate: (route: string) => void;
}) {
  const t = useTranslations();
  const startSOS = useIncidentStore((s) => s.startSOS);
  const activeIncidentId = useIncidentStore((s) => s.activeIncidentId);

  const [mounted, setMounted] = useState(open);
  const backdrop = useRef(new Animated.Value(0)).current;
  const panel = useRef(new Animated.Value(0)).current;
  // Header, primary tile, secondary row — revealed top-down after the panel lands.
  const rows = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (open) setMounted(true);

    const to = open ? 1 : 0;
    let anims: Animated.CompositeAnimation[];
    if (reducedMotion) {
      anims = [backdrop, panel, ...rows].map((v) =>
        Animated.timing(v, { toValue: to, duration: 0, useNativeDriver: true }),
      );
    } else if (open) {
      anims = [
        Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(panel, {
          toValue: 1,
          duration: 420,
          easing: Easing.bezier(0.22, 1.25, 0.36, 1),
          useNativeDriver: true,
        }),
        ...rows.map((v, i) =>
          Animated.timing(v, {
            toValue: 1,
            delay: 70 + i * 55,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ),
      ];
    } else {
      anims = [backdrop, panel, ...rows].map((v) =>
        Animated.timing(v, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      );
    }

    Animated.parallel(anims).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, reducedMotion]);

  // Android back closes the menu instead of leaving the screen.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open]);

  if (!mounted) return null;

  const report = () => {
    if (activeIncidentId) {
      onNavigate(`/incidents/${activeIncidentId}`);
      return;
    }
    // Same entry as the home SOS: location first, GPS stays optional.
    startSOS();
    onNavigate('/emergency/location');
  };

  const callHotline = () => {
    onClose();
    Linking.openURL(`tel:${MDRRMO_HOTLINE}`).catch(() => undefined);
  };

  const rise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  });

  return (
    <View pointerEvents={open ? 'box-none' : 'none'} style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdrop }]}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.backdrop }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close quick actions"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          {
            width: panelWidth,
            left: centerX - panelWidth / 2,
            bottom: panelBottom,
            opacity: panel.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
            transform: [
              // Grows up out of the + button.
              { translateY: panel.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
              { scale: panel.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
            ],
          },
        ]}
      >
        {/* Pointer centred on the + button. */}
        <View style={[styles.notch, { left: panelWidth / 2 - NOTCH / 2 }]} />

        <Animated.View style={[styles.panelHeader, rise(rows[0])]}>
          <Text style={styles.panelTitle}>{t.home.navQuickActions}</Text>
        </Animated.View>

        {/* Primary — the emergency action is always the biggest target. */}
        <Animated.View style={rise(rows[1])}>
          <Pressable
            onPress={report}
            accessibilityRole="button"
            accessibilityLabel={activeIncidentId ? t.home.navViewActive : t.home.navReport}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <LinearGradient
              colors={[COLORS.danger, COLORS.dangerDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryTile}
            >
              <View style={styles.primaryIcon}>
                <Ionicons name={activeIncidentId ? 'pulse' : 'alert'} size={24} color={COLORS.white} />
              </View>
              <View style={styles.tileText}>
                <Text numberOfLines={1} style={styles.primaryTitle}>
                  {activeIncidentId ? t.home.navViewActive : t.home.navReport}
                </Text>
                <Text numberOfLines={1} style={styles.primarySub}>
                  {activeIncidentId ? t.home.navViewActiveSub : t.home.navReportSub}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.85)" />
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* Secondary — two equal tiles on one grid line. */}
        <Animated.View style={[styles.secondaryRow, rise(rows[2])]}>
          <SecondaryTile
            icon="medkit"
            tint={COLORS.primary}
            tintSoft={COLORS.primarySoft}
            title={t.home.navFirstAid}
            subtitle={t.home.navFirstAidSub}
            onPress={() => onNavigate('/first-aid')}
          />
          <SecondaryTile
            icon="call"
            tint={COLORS.navy}
            tintSoft={COLORS.navySoft}
            title={t.home.navHotline}
            subtitle={MDRRMO_HOTLINE_DISPLAY}
            accessibilityLabel={`${t.home.navHotline}, ${MDRRMO_HOTLINE_DISPLAY}`}
            onPress={callHotline}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function SecondaryTile({
  icon,
  tint,
  tintSoft,
  title,
  subtitle,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  tint: string;
  tintSoft: string;
  title: string;
  subtitle: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.secondaryTile, pressed && styles.secondaryPressed]}
    >
      <View style={[styles.secondaryIcon, { backgroundColor: tintSoft }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.secondaryTitle}>
        {title}
      </Text>
      <Text numberOfLines={1} style={styles.secondarySub}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    STYLES                                  */
/* -------------------------------------------------------------------------- */

const shadow = (color: string, opacity: number, radius: number, y: number, elevation: number) =>
  Platform.select({
    ios: {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: y },
    },
    android: { elevation },
  });

const styles = StyleSheet.create({
  // Full-screen, touch-transparent host so the + button and fan menu sit inside
  // real bounds (Android drops touches outside a parent's frame).
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
  },

  bar: {
    position: 'absolute',
    left: SIDE_GUTTER,
    right: SIDE_GUTTER,
    height: BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BAR_PAD,
    borderRadius: BAR_H / 2,
    backgroundColor: COLORS.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    ...shadow('#18231F', 0.12, 16, 7, 9),
  },

  blob: {
    position: 'absolute',
    left: BAR_PAD,
    top: (BAR_H - BLOB_H) / 2,
    height: BLOB_H,
    borderRadius: BLOB_H / 2,
    ...shadow(COLORS.primary, 0.3, 10, 5, 4),
  },
  blobFill: {
    flex: 1,
    borderRadius: BLOB_H / 2,
  },

  tab: {
    flex: 1,
    height: BLOB_H,
    minWidth: 0,
  },
  tabInner: {
    flex: 1,
  },
  tabLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  label: {
    marginTop: 2,
    fontSize: 10.5,
    letterSpacing: -0.1,
  },

  fabWrap: {
    position: 'absolute',
    width: FAB,
    height: FAB,
    zIndex: 3,
    ...shadow(COLORS.primary, 0.35, 12, 6, 12),
  },
  fabRing: {
    flex: 1,
    borderRadius: FAB / 2,
    padding: 4,
    backgroundColor: COLORS.white,
  },
  fab: {
    flex: 1,
    borderRadius: FAB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  panel: {
    position: 'absolute',
    padding: 14,
    borderRadius: 28,
    backgroundColor: COLORS.white,
    ...shadow('#0B1F1B', 0.22, 24, 10, 16),
  },
  notch: {
    position: 'absolute',
    bottom: -NOTCH / 2 + 1,
    width: NOTCH,
    height: NOTCH,
    borderRadius: 3,
    backgroundColor: COLORS.white,
    transform: [{ rotate: '45deg' }],
  },
  panelHeader: {
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },

  primaryTile: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 12,
  },
  primaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tileText: {
    flex: 1,
    minWidth: 0,
  },
  primaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.white,
  },
  primarySub: {
    marginTop: 2,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.85)',
  },

  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  secondaryTile: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  secondaryPressed: {
    backgroundColor: COLORS.border,
    transform: [{ scale: 0.97 }],
  },
  secondaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  secondaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ink,
  },
  secondarySub: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.muted,
  },
});
