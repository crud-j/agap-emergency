import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslations } from '../../hooks/useAccessibility';
import { passwordStrength, type PasswordLevel, type PasswordRuleKey } from '../../lib/password-strength';

/**
 * Four-segment strength meter under the registration password field: the segments fill as the password gets
 * stronger, with the strength on the left and the one next thing to fix on the right. Reanimated follows the
 * phone's reduced-motion setting, so the fill doesn't animate when animations are off.
 */

const SEGMENTS = [1, 2, 3, 4] as const;

/** Bar colour and (darker, readable on white) word colour per level. */
const LEVEL_COLORS: Record<Exclude<PasswordLevel, 0>, { bar: string; word: string }> = {
  1: { bar: '#FF3B30', word: '#D92D20' },
  2: { bar: '#FF9F0A', word: '#B45309' },
  3: { bar: '#4FA3FF', word: '#0050C8' },
  4: { bar: '#1DB954', word: '#12893C' },
};

const FILL_EASING = Easing.bezier(0.32, 0.72, 0, 1);

function Segment({ filled, color }: { filled: boolean; color: string }) {
  const progress = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(filled ? 1 : 0, { duration: 420, easing: FILL_EASING });
  }, [filled, progress]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

interface Props {
  password: string;
  /** A validation error for the field; shown under the meter in place of nothing else. */
  error?: string | undefined;
}

export default function PasswordStrengthMeter({ password, error }: Props) {
  const t = useTranslations().registration;
  const { level, nextRule } = passwordStrength(password);

  const words: Record<PasswordLevel, string> = {
    0: t.passwordStrengthEmpty,
    1: t.passwordWeak,
    2: t.passwordFair,
    3: t.passwordGood,
    4: t.passwordStrong,
  };
  const hints: Record<PasswordRuleKey, string> = {
    length: t.passwordHintLength,
    lowercase: t.passwordHintLowercase,
    uppercase: t.passwordHintUppercase,
    number: t.passwordHintNumber,
    symbol: t.passwordHintSymbol,
    maximum: t.passwordHintMaximum,
  };
  // Before typing, say how long it must be; while typing, the next thing to fix; once strong, nothing.
  const hint = level === 0 ? hints.length : nextRule ? hints[nextRule] : '';
  const color = level === 0 ? null : LEVEL_COLORS[level];

  return (
    <View>
      <View
        style={styles.meter}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t.passwordStrengthLabel}
        accessibilityValue={{ min: 0, max: 4, now: level, text: words[level] }}
      >
        {SEGMENTS.map((segment) => (
          <Segment key={segment} filled={segment <= level} color={color?.bar ?? '#DCE4F0'} />
        ))}
      </View>
      <View style={styles.status} accessibilityLiveRegion="polite">
        <Text style={[styles.word, color && { color: color.word }]}>{words[level]}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meter: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 12,
    paddingHorizontal: 2,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#EBF0F7',
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 3,
    transformOrigin: 'left',
  },
  status: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  word: {
    fontSize: 12,
    fontWeight: '600',
    color: '#66666B',
  },
  hint: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '500',
    color: '#66666B',
  },
  error: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
    paddingHorizontal: 4,
  },
});
