import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ResponderAvailability } from '@agap/shared';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useUpdateAvailability } from '../../hooks/useResponderSummary';
import { useAccessibilityStore } from '../../stores/accessibility.store';
import { colors, radius } from '../../theme/tokens';

const OPTIONS: Array<{ value: ResponderAvailability; label: string; color: string }> = [
  { value: ResponderAvailability.AVAILABLE,   label: 'Available',   color: colors.primary },
  { value: ResponderAvailability.OFF_DUTY,    label: 'Off Duty',    color: colors.textSub },
  { value: ResponderAvailability.UNAVAILABLE, label: 'Unavailable', color: colors.danger },
];

const PAD = 4;

interface Props {
  /** Server-confirmed current status from useResponderSummary */
  currentStatus: string;
}

/**
 * Three-state availability selector (AVAILABLE / OFF_DUTY / UNAVAILABLE) as a
 * segmented control. Disabled while a mutation is in flight or the device is
 * offline. Shows inline error text on 409 ACTIVE_ASSIGNMENT without changing the
 * displayed state: the thumb only moves to the server-confirmed status.
 */
export function AvailabilityControl({ currentStatus }: Props) {
  const mutation    = useUpdateAvailability();
  const { isOnline } = useNetworkStatus();
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);
  const isDisabled  = mutation.isPending || !isOnline;
  const isConflict  = mutation.isError && mutation.error?.message === 'ACTIVE_ASSIGNMENT';
  const isGenericError = mutation.isError && !isConflict;

  const [trackW, setTrackW] = useState(0);
  const segW = trackW > 0 ? (trackW - PAD * 2) / OPTIONS.length : 0;
  const index = OPTIONS.findIndex((o) => o.value === currentStatus);
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (segW === 0 || index < 0) return;
    const to = index * segW;
    // First placement (and Reduce Motion) jumps; later changes slide.
    if (!placed.current || reducedMotion) {
      x.setValue(to);
      placed.current = true;
      return;
    }
    Animated.timing(x, {
      toValue: to,
      duration: 260,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: true,
    }).start();
  }, [index, segW, reducedMotion]);

  return (
    <View>
      <View
        style={[styles.track, isDisabled && !mutation.isPending && styles.trackDisabled]}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        accessibilityRole="radiogroup"
      >
        {segW > 0 && index >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.thumb, { width: segW, transform: [{ translateX: x }] }]}
          />
        ) : null}

        {OPTIONS.map((opt) => {
          const active = currentStatus === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={styles.segment}
              onPress={() => {
                if (!active && !isDisabled) {
                  Haptics.selectionAsync().catch(() => undefined);
                  mutation.mutate({ status: opt.value });
                }
              }}
              disabled={isDisabled && !active}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: isDisabled }}
              accessibilityLabel={opt.label}
            >
              <View style={[styles.dot, { backgroundColor: opt.color, opacity: active ? 1 : 0.55 }]} />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                // Off Duty's grey is too faint for text (3.1:1), so its label uses body ink.
                style={[styles.segText, active && { color: opt.color === colors.textSub ? colors.text : opt.color, fontWeight: '800' }]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mutation.isPending && (
        <View style={styles.pendingRow}>
          <ActivityIndicator size="small" color={colors.textSub} />
          <Text style={styles.pendingText}>Updating your status…</Text>
        </View>
      )}
      {isConflict && (
        <Text style={styles.errorText}>
          Cannot change status while an assignment is active.
        </Text>
      )}
      {isGenericError && (
        <Text style={styles.errorText}>Update failed. Please try again.</Text>
      )}
      {!isOnline && (
        <Text style={styles.offlineText}>
          Duty changes require a network connection.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: PAD,
    borderRadius: radius.md + PAD,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackDisabled: { opacity: 0.55 },
  thumb: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    shadowColor: '#8795A3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 2,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  segText: { fontSize: 13, fontWeight: '600', color: colors.textMid, flexShrink: 1 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  pendingText: { fontSize: 12, color: colors.textMuted },
  errorText: { marginTop: 8, fontSize: 12, color: colors.dangerStrong },
  offlineText: { marginTop: 8, fontSize: 12, color: colors.amberText },
});
