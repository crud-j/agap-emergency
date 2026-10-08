import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useTranslations } from '../../hooks/useAccessibility';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type LabelKey =
  | 'tabHome'
  | 'tabIncidents'
  | 'tabFirstAid'
  | 'tabAnnouncements'
  | 'tabProfile';

interface TabDef {
  route: string;
  labelKey: LabelKey;
  icon: IconName;
  iconActive: IconName;
}

/* -------------------------------------------------------------------------- */
/*                                  TAB DATA                                  */
/* -------------------------------------------------------------------------- */

const TABS: TabDef[] = [
  {
    route: '/home',
    labelKey: 'tabHome',
    icon: 'home-outline',
    iconActive: 'home',
  },
  {
    route: '/incidents',
    labelKey: 'tabIncidents',
    icon: 'document-text-outline',
    iconActive: 'document-text',
  },
  {
    route: '/announcements',
    labelKey: 'tabAnnouncements',
    icon: 'megaphone-outline',
    iconActive: 'megaphone',
  },
  {
    route: '/profile',
    labelKey: 'tabProfile',
    icon: 'person-outline',
    iconActive: 'person',
  },
];

/* -------------------------------------------------------------------------- */
/*                                   COLORS                                   */
/* -------------------------------------------------------------------------- */

const COLORS = {
  white: '#FFFFFF',

  primary: '#0D6053',
  primarySoft: '#EEF7F4',

  text: '#40536D',
  inactive: '#52647A',

  border: '#E9ECEB',
};

/* -------------------------------------------------------------------------- */
/*                               BOTTOM NAVIGATION                            */
/* -------------------------------------------------------------------------- */

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const t = useTranslations();

  const isActive = (route: string) =>
    pathname === route || pathname.startsWith(`${route}/`);

  const go = (route: string) => {
    if (pathname !== route) {
      router.replace(route as never);
    }
  };

  /*
   * Five equal visual positions:
   *
   * Home | Incidents | First Aid | Announcements | Profile
   *
   * The center position is reserved permanently, so animations from the
   * surrounding tabs can never move into its space.
   */
  const leftTabs = TABS.slice(0, 2);
  const rightTabs = TABS.slice(2);

  const bottomSpacing = Math.max(insets.bottom + 8, 22);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          bottom: bottomSpacing,
        },
      ]}
    >
      <View style={styles.bar}>
        {/* -------------------------------------------------------------- */}
        {/* LEFT                                                           */}
        {/* -------------------------------------------------------------- */}

        {leftTabs.map((tab) => (
          <TabItem
            key={tab.route}
            tab={tab}
            label={t.home[tab.labelKey]}
            active={isActive(tab.route)}
            onPress={() => go(tab.route)}
          />
        ))}

        {/* -------------------------------------------------------------- */}
        {/* CENTER SOS                                                     */}
        {/* -------------------------------------------------------------- */}

        <View style={styles.sosSlot}>
          <CenterButton
            label={t.home.tabFirstAid}
            onPress={() => router.push('/first-aid' as never)}
            active={isActive('/first-aid')}
          />
        </View>

        {/* -------------------------------------------------------------- */}
        {/* RIGHT                                                           */}
        {/* -------------------------------------------------------------- */}

        {rightTabs.map((tab) => (
          <TabItem
            key={tab.route}
            tab={tab}
            label={t.home[tab.labelKey]}
            active={isActive(tab.route)}
            onPress={() => go(tab.route)}
          />
        ))}
      </View>
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
  onPress,
}: {
  tab: TabDef;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const activeProgress = useRef(
    new Animated.Value(active ? 1 : 0)
  ).current;

  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(activeProgress, {
      toValue: active ? 1 : 0,

      /*
       * Fast, controlled movement.
       * This prevents the active animation from lingering and visually
       * colliding with the neighboring SOS area.
       */
      tension: 180,
      friction: 18,

      useNativeDriver: true,
    }).start();
  }, [active, activeProgress]);

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.96,
      tension: 300,
      friction: 20,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      tension: 300,
      friction: 20,
      useNativeDriver: true,
    }).start();
  };

  const backgroundOpacity = activeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const iconScale = activeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });

  const labelTranslate = activeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const color = active ? COLORS.primary : COLORS.inactive;

  return (
    <Pressable
      style={styles.tab}
      accessibilityRole="button"
      accessibilityState={{
        selected: active,
      }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.tabPressWrapper,
          {
            transform: [{ scale: pressScale }],
          },
        ]}
      >
        {/* -------------------------------------------------------------- */}
        {/* ACTIVE BACKGROUND                                              */}
        {/* -------------------------------------------------------------- */}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeBackground,
            {
              opacity: backgroundOpacity,
            },
          ]}
        />

        {/* -------------------------------------------------------------- */}
        {/* ICON                                                           */}
        {/* -------------------------------------------------------------- */}

        <Animated.View
          style={[
            styles.iconWrapper,
            {
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <Ionicons
            name={active ? tab.iconActive : tab.icon}
            size={27}
            color={color}
          />
        </Animated.View>

        {/* -------------------------------------------------------------- */}
        {/* LABEL                                                          */}
        {/* -------------------------------------------------------------- */}

        <Animated.Text
          numberOfLines={1}
          style={[
            styles.label,
            {
              color,
              fontWeight: active ? '600' : '500',
              transform: [
                {
                  translateY: labelTranslate,
                },
              ],
            },
          ]}
        >
          {label}
        </Animated.Text>

        {/* -------------------------------------------------------------- */}
        {/* ACTIVE INDICATOR                                               */}
        {/* -------------------------------------------------------------- */}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeIndicator,
            {
              opacity: activeProgress,
              transform: [
                {
                  scaleX: activeProgress,
                },
              ],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*                              FIRST AID BUTTON                              */
/* -------------------------------------------------------------------------- */

function CenterButton({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  active: boolean;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.91,
      tension: 300,
      friction: 18,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      tension: 300,
      friction: 18,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={styles.sosContainer}>
      <Animated.View
        style={[
          styles.sosAnimatedWrapper,
          { transform: [{ scale: pressScale }] },
        ]}
      >
        <Pressable
          style={styles.sosOuter}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Opens the First Aid guide"
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <View style={[styles.sosButton, active && styles.sosButtonActive]}>
            <Ionicons
              name="medkit"
              size={26}
              color={COLORS.white}
            />
          </View>
        </Pressable>
      </Animated.View>

      <Text
        style={styles.sosLabel}
        numberOfLines={1}
        accessibilityElementsHidden
      >
        {label}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    STYLES                                  */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  /* ---------------------------------------------------------------------- */
  /* CONTAINER                                                              */
  /* ---------------------------------------------------------------------- */

  container: {
    position: 'absolute',

    left: 16,
    right: 16,

    zIndex: 100,
  },

  /* ---------------------------------------------------------------------- */
  /* MAIN BAR                                                               */
  /* ---------------------------------------------------------------------- */

  bar: {
    height: 76,

    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: COLORS.white,

    borderRadius: 38,

    paddingHorizontal: 5,

    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,

    ...Platform.select({
      ios: {
        shadowColor: '#18231F',
        shadowOffset: {
          width: 0,
          height: 7,
        },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },

      android: {
        elevation: 9,
      },
    }),
  },

  /* ---------------------------------------------------------------------- */
  /* TAB                                                                    */
  /* ---------------------------------------------------------------------- */

  tab: {
    flex: 1,

    height: '100%',

    alignItems: 'center',
    justifyContent: 'center',

    minWidth: 0,
  },

  tabPressWrapper: {
    width: '90%',
    height: 64,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 20,

    position: 'relative',

    overflow: 'hidden',
  },

  activeBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,

    backgroundColor: COLORS.primarySoft,

    borderRadius: 20,
  },

  iconWrapper: {
    height: 30,

    alignItems: 'center',
    justifyContent: 'center',
  },

  label: {
    marginTop: 1,

    fontSize: 11,

    lineHeight: 15,

    textAlign: 'center',

    maxWidth: 76,

    letterSpacing: 0.05,
  },

  activeIndicator: {
    position: 'absolute',

    bottom: 3,

    width: 28,
    height: 3,

    borderRadius: 3,

    backgroundColor: COLORS.primary,
  },

  /* ---------------------------------------------------------------------- */
  /* SOS SLOT                                                               */
  /* ---------------------------------------------------------------------- */

  sosSlot: {
    flex: 1,

    height: '100%',

    alignItems: 'center',
    justifyContent: 'center',

    position: 'relative',

    /*
     * This creates the visual center position.
     * Nothing from the surrounding tabs is allowed to occupy this slot.
     */
    zIndex: 20,
  },

  sosContainer: {
    position: 'absolute',

    top: -27,

    width: 78,

    alignItems: 'center',
  },

  sosAnimatedWrapper: {
    width: 72,
    height: 72,

    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ---------------------------------------------------------------------- */
  /* SOS OUTER RING                                                         */
  /* ---------------------------------------------------------------------- */

  sosOuter: {
    width: 72,
    height: 72,

    borderRadius: 36,

    backgroundColor: COLORS.white,

    alignItems: 'center',
    justifyContent: 'center',

    ...Platform.select({
      ios: {
        shadowColor: '#17221F',
        shadowOffset: {
          width: 0,
          height: 5,
        },
        shadowOpacity: 0.14,
        shadowRadius: 9,
      },

      android: {
        elevation: 7,
      },
    }),
  },

  /* ---------------------------------------------------------------------- */
  /* SOS CORE                                                                */
  /* ---------------------------------------------------------------------- */

  sosButton: {
    width: 60,
    height: 60,

    borderRadius: 30,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: COLORS.primary,
  },

  sosButtonActive: {
    backgroundColor: COLORS.primarySoft,
  },

  sosLabel: {
    marginTop: 4,

    fontSize: 11,
    lineHeight: 15,

    fontWeight: '500',

    color: COLORS.inactive,

    textAlign: 'center',

    letterSpacing: 0.05,
  },
});