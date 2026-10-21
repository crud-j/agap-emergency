import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StatusBar, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LETTER_A, SIGNAL_STROKES } from './agap-mark-paths';

const TILE = require('@/assets/icons/agap-splash-tile.png') as number;

const ICON_SIZE = 128;
const BRAND_TEAL = '#0D6053';
const MARK_WHITE = '#FEFEFE';

const WORD = ['A', 'G', 'A', 'P'] as const;
const WORD_SIZE = 40;
const WORD_LINE = 46;

// Timeline (ms), ~1.5 s end to end. One pass only — nothing here loops.
const TILE_IN = { delay: 0, duration: 420 };
const LETTER_IN = { delay: 160, duration: 360 };
const STROKE_IN = { delay: 400, stagger: 80, duration: 280 };
const WORD_IN = { delay: 600, stagger: 60, duration: 340 };
const MIN_VISIBLE = 1200;
const FADE_OUT = 300;
// Never hold the app hostage: dismiss even if `ready` never arrives.
const MAX_VISIBLE = 4000;

const easeOut = Easing.out(Easing.cubic);
// A whisper of overshoot so the tile "lands" instead of just stopping.
const settle = Easing.out(Easing.back(1.3));

function timing(value: Animated.Value, delay: number, duration: number, easing = easeOut) {
  return Animated.timing(value, { toValue: 1, delay, duration, easing, useNativeDriver: true });
}

function lerp(v: Animated.Value, from: number, to = 0) {
  return v.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
}

/** A full-size layer that shares the icon's 200 × 200 viewBox so paths line up. */
function MarkLayer({ d }: { d: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
      <Path d={d} fill={MARK_WHITE} />
    </Svg>
  );
}

/**
 * Launch splash: white background, the AGAP tile lands, the "A" settles in,
 * the three signal strokes slide in one after another, then each letter of the
 * wordmark rises out of a mask. Once the minimum time has passed and `ready`
 * is true, the overlay lifts away over whatever route AuthGuard has placed
 * underneath.
 */
export function AgapSplash({
  ready,
  reducedMotion = false,
  onFinish,
}: {
  ready: boolean;
  reducedMotion?: boolean;
  onFinish: () => void;
}) {
  const start = reducedMotion ? 1 : 0;
  const tile = useRef(new Animated.Value(start)).current;
  const letter = useRef(new Animated.Value(start)).current;
  const strokes = useRef(SIGNAL_STROKES.map(() => new Animated.Value(start))).current;
  const word = useRef(WORD.map(() => new Animated.Value(start))).current;
  const exit = useRef(new Animated.Value(0)).current;

  const [minElapsed, setMinElapsed] = useState(false);
  const [maxElapsed, setMaxElapsed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!reducedMotion) {
      Animated.parallel([
        timing(tile, TILE_IN.delay, TILE_IN.duration, settle),
        timing(letter, LETTER_IN.delay, LETTER_IN.duration),
        ...strokes.map((v, i) =>
          timing(v, STROKE_IN.delay + i * STROKE_IN.stagger, STROKE_IN.duration),
        ),
        ...word.map((v, i) => timing(v, WORD_IN.delay + i * WORD_IN.stagger, WORD_IN.duration)),
      ]).start();
    }
    const min = setTimeout(() => setMinElapsed(true), reducedMotion ? 500 : MIN_VISIBLE);
    const max = setTimeout(() => setMaxElapsed(true), MAX_VISIBLE);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, []);

  useEffect(() => {
    if (leaving || !((minElapsed && ready) || maxElapsed)) return;
    setLeaving(true);
    Animated.timing(exit, {
      toValue: 1,
      duration: reducedMotion ? 180 : FADE_OUT,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(() => onFinish());
  }, [minElapsed, maxElapsed, ready, leaving]);

  return (
    <Animated.View
      style={[styles.root, { opacity: lerp(exit, 1, 0) }]}
      // Let taps reach the screen underneath as soon as the exit starts.
      pointerEvents={leaving ? 'none' : 'auto'}
      accessible
      accessibilityLabel="AGAP"
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Content drifts up and grows a touch on exit so the hand-off feels like a lift. */}
      <Animated.View
        style={[
          styles.content,
          {
            transform: [
              { translateY: lerp(exit, 0, -12) },
              { scale: lerp(exit, 1, 1.04) },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.iconShadow,
            { opacity: tile, transform: [{ scale: lerp(tile, 0.82, 1) }] },
          ]}
        >
          <View style={styles.icon}>
            <Image source={TILE} style={styles.tile} />

            {strokes.map((v, i) => (
              <Animated.View
                key={i}
                style={[
                  StyleSheet.absoluteFill,
                  { opacity: v, transform: [{ translateX: lerp(v, -16) }] },
                ]}
              >
                <MarkLayer d={SIGNAL_STROKES[i]} />
              </Animated.View>
            ))}

            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: letter,
                  transform: [{ translateY: lerp(letter, 8) }, { scale: lerp(letter, 0.94, 1) }],
                },
              ]}
            >
              <MarkLayer d={LETTER_A} />
            </Animated.View>
          </View>
        </Animated.View>

        <View style={styles.word}>
          {WORD.map((ch, i) => (
            // Each letter rises out of its own clip box, left to right.
            <View key={i} style={styles.glyphMask}>
              <Animated.Text
                style={[
                  styles.glyph,
                  {
                    opacity: word[i],
                    transform: [{ translateY: lerp(word[i], WORD_LINE * 0.7) }],
                  },
                ]}
              >
                {ch}
              </Animated.Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { alignItems: 'center' },
  iconShadow: {
    borderRadius: ICON_SIZE * 0.06,
    backgroundColor: '#FFFFFF',
    shadowColor: BRAND_TEAL,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE * 0.06,
    overflow: 'hidden',
  },
  tile: { width: ICON_SIZE, height: ICON_SIZE },
  word: {
    flexDirection: 'row',
    marginTop: 22,
  },
  glyphMask: {
    height: WORD_LINE,
    overflow: 'hidden',
    // Pull letters together for a dense, heavy wordmark.
    marginHorizontal: -0.5,
  },
  glyph: {
    fontSize: WORD_SIZE,
    lineHeight: WORD_LINE,
    fontWeight: '900',
    letterSpacing: -1,
    color: BRAND_TEAL,
    includeFontPadding: false,
  },
});

export default AgapSplash;
