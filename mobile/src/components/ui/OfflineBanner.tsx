import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import { colors } from '@/src/theme/tokens';

interface BannerContent {
  bg: string;
  iconName: string;
  message: string;
}

function getContent(isOnline: boolean): BannerContent | null {
  if (!isOnline) {
    return {
      bg: colors.amber,
      iconName: 'cloud-offline-outline',
      message: 'No internet — reports cannot be sent. Call 911 for emergencies',
    };
  }
  return null;
}

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-80)).current;
  const [rendered, setRendered] = useState(false);

  const content = getContent(isOnline);
  const shouldShow = content !== null;

  useEffect(() => {
    if (shouldShow) {
      setRendered(true);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 7,
        tension: 55,
      }).start();
    } else {
      Animated.spring(translateY, {
        toValue: -80,
        useNativeDriver: true,
        friction: 7,
        tension: 55,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [shouldShow]);

  if (!rendered || !content) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: content.bg, paddingTop: insets.top + 8 },
        { transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <View style={styles.row}>
        <Ionicons name={content.iconName as any} size={14} color="#fff" style={styles.icon} />
        <Text style={styles.message} numberOfLines={1}>
          {content.message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 6,
  },
  icon: { flexShrink: 0 },
  message: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    flexShrink: 1,
  },
});
