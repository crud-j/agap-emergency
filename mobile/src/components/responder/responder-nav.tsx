import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: Array<{
  route: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
}> = [
  { route: '/responder/home',        label: 'Home',     icon: 'home-outline',   iconActive: 'home'   },
  { route: '/responder/assignments', label: 'Missions', icon: 'list-outline',   iconActive: 'list'   },
  { route: '/responder/map',         label: 'Map',      icon: 'map-outline',    iconActive: 'map'    },
  { route: '/responder/profile',     label: 'Profile',  icon: 'person-outline', iconActive: 'person' },
];

export function ResponderNav() {
  const router  = useRouter();
  const pathname = usePathname();
  const insets  = useSafeAreaInsets();

  const go = (route: string) => {
    if (pathname !== route) router.replace(route as never);
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const active = pathname === tab.route;
          return (
            <Pressable
              key={tab.route}
              style={styles.tab}
              onPress={() => go(tab.route)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
            >
              <View style={[styles.tabInner, active && styles.tabInnerActive]}>
                <Ionicons
                  name={active ? tab.iconActive : tab.icon}
                  size={23}
                  color={active ? '#0D6053' : '#8795A3'}
                />
                <Text style={[styles.label, active && styles.labelActive]}>
                  {tab.label}
                </Text>
              </View>
              {active && <View style={styles.indicator} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(168,181,193,0.30)',
    ...Platform.select({
      ios:     { shadowColor: '#8795A3', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  bar: {
    flexDirection: 'row',
    height: 58,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  tabInnerActive: {
    backgroundColor: '#EEF7F4',
  },
  label: {
    fontSize: 10,
    color: '#8795A3',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  labelActive: {
    color: '#0D6053',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#0D6053',
  },
});
