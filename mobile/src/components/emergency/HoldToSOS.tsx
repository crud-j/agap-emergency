import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSOSAudio, SoundSource } from '../../hooks/useSOSAudio';

// expo-haptics requires a native module absent from Expo Go.
// Lazy-require so the import never crashes the loader; haptics are a silent no-op
// in Expo Go and work normally in dev-client / production builds.
type HapticsModule = typeof import('expo-haptics');
let Haptics: HapticsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Haptics = require('expo-haptics') as HapticsModule;
} catch { /* Expo Go — haptics disabled */ }

const SIZE = 240;
const DIAL = 216;
const RADIUS = 76;
const STROKE_WIDTH = 62;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const BUTTON = 120;

// Decorative inner / outer edge arcs (bevel + depth) — each has its own circumference
const ARC_INNER_R = RADIUS - STROKE_WIDTH / 2 + 2;   // 47 — inner bevel edge
const ARC_OUTER_R = RADIUS + STROKE_WIDTH / 2 - 2;   // 105 — outer depth edge
const CIRC_INNER = 2 * Math.PI * ARC_INNER_R;
const CIRC_OUTER = 2 * Math.PI * ARC_OUTER_R;

// Repeating vibration pattern (ms): [delay, on, off, on, off, on]
// Android uses the full pattern; iOS repeats a single buzz via the Vibration loop.
const VIBRATION_PATTERN = Platform.OS === 'android'
  ? [0, 350, 150, 350, 150, 350]
  : [0, 400];

type HoldToSOSProps = {
  duration?: number;
  onComplete: () => void;
  disabled?: boolean;
  reducedMotion?: boolean;
  /** Optional looping alert sound played while holding. Pass null to disable audio. */
  soundSource?: SoundSource;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function HoldToSOS({
  duration = 3000,
  onComplete,
  disabled = false,
  reducedMotion = false,
  soundSource = null,
}: HoldToSOSProps) {
  const gradientId = `sos-grad-${useId().replace(/:/g, '')}`;
  const arcHighlightId = `sos-arc-highlight-${useId().replace(/:/g, '')}`;
  const buttonSurfaceId = `sos-button-surface-${useId().replace(/:/g, '')}`;
  const buttonInsetId = `sos-button-inset-${useId().replace(/:/g, '')}`;
  const dialDepthId = `sos-dial-depth-${useId().replace(/:/g, '')}`;

  const progress = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  const holdDuration = Math.max(1, duration);

  const { startAudio, stopAudio } = useSOSAudio(soundSource);

  const [holding, setHolding] = useState(false);
  const [remaining, setRemaining] = useState(
    Math.ceil(holdDuration / 1000),
  );

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopAnimation = useCallback(() => {
    animationRef.current?.stop();
    animationRef.current = null;
    clearTimer();
  }, [clearTimer]);

  const springPress = useCallback(
    (toValue: number) => {
      Animated.spring(press, {
        toValue,
        useNativeDriver: true,
        tension: 180,
        friction: 15,
      }).start();
    },
    [press],
  );

  const resetProgress = useCallback(() => {
    holdingRef.current = false;
    stopAnimation();

    startedAtRef.current = null;
    completedRef.current = false;

    stopAudio();
    Vibration.cancel();

    springPress(0);

    Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? 0 : 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    setHolding(false);
    setRemaining(Math.ceil(holdDuration / 1000));
  }, [
    holdDuration,
    progress,
    reducedMotion,
    springPress,
    stopAnimation,
    stopAudio,
  ]);

  const startHold = useCallback(() => {
    if (disabled || holdingRef.current) return;

    stopAnimation();

    holdingRef.current = true;
    completedRef.current = false;
    startedAtRef.current = Date.now();

    setHolding(true);
    setRemaining(Math.ceil(holdDuration / 1000));

    springPress(1);

    // Alert the user they are actively holding SOS — looping audio + haptic pulse.
    startAudio();
    if (!reducedMotion) {
      Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      Vibration.vibrate(VIBRATION_PATTERN, true);
    }

    animationRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: holdDuration,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    timerRef.current = setInterval(() => {
      const startedAt = startedAtRef.current;

      if (startedAt === null || !holdingRef.current) return;

      const elapsed = Date.now() - startedAt;
      const remainingMs = Math.max(holdDuration - elapsed, 0);

      setRemaining(Math.ceil(remainingMs / 1000));
    }, 100);

    animationRef.current.start(({ finished }) => {
      clearTimer();
      animationRef.current = null;

      if (
        !finished ||
        !holdingRef.current ||
        completedRef.current
      ) {
        return;
      }

      holdingRef.current = false;
      completedRef.current = true;
      startedAtRef.current = null;

      stopAudio();
      Vibration.cancel();
      Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      springPress(0);
      setHolding(false);
      setRemaining(0);

      onCompleteRef.current();
    });
  }, [
    clearTimer,
    disabled,
    holdDuration,
    progress,
    reducedMotion,
    springPress,
    startAudio,
    stopAudio,
    stopAnimation,
  ]);

  const cancelHold = useCallback(() => {
    if (!holdingRef.current) return;
    resetProgress();
  }, [resetProgress]);

  useEffect(() => {
    if (disabled && holdingRef.current) {
      resetProgress();
    }
  }, [disabled, resetProgress]);

  useEffect(() => {
    return () => {
      holdingRef.current = false;
      stopAnimation();
    };
  }, [stopAnimation]);

  /*
   * ================================================================
   * PROGRESS
   * ================================================================
   */

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  const progressOpacity = progress.interpolate({
    inputRange: [0, 0.006, 0.03, 1],
    outputRange: [0, 0.6, 1, 1],
  });

  /*
   * ================================================================
   * PRESS / 3D DEPTH
   * ================================================================
   */

  const dialScale = reducedMotion
    ? 1
    : press.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.978],
      });

  const dialShadowOpacity = reducedMotion
    ? 0.35
    : press.interpolate({
        inputRange: [0, 1],
        outputRange: [0.35, 0.16],
      });

  const buttonScale = reducedMotion
    ? 1
    : press.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.925],
      });

  const buttonShadowOpacity = reducedMotion
    ? holding
      ? 0.14
      : 0.34
    : press.interpolate({
        inputRange: [0, 1],
        outputRange: [0.34, 0.14],
      });

  /*
   * Strong inset shadow during active hold.
   */
  const insetShadowOpacity = reducedMotion
    ? holding
      ? 0.9
      : 0.16
    : press.interpolate({
        inputRange: [0, 1],
        outputRange: [0.16, 0.9],
      });

  /*
   * Specular highlight gets compressed during press.
   */
  const specularOpacity = reducedMotion
    ? holding
      ? 0.1
      : 0.42
    : press.interpolate({
        inputRange: [0, 1],
        outputRange: [0.42, 0.1],
      });

  /*
   * Fine rim becomes less visible as the button sinks.
   */
  const rimOpacity = reducedMotion
    ? holding
      ? 0.12
      : 0.42
    : press.interpolate({
        inputRange: [0, 1],
        outputRange: [0.42, 0.12],
      });

  /*
   * Arc glow is deliberately restrained.
   */
  const arcGlowOpacity = progress.interpolate({
    inputRange: [0, 0.03, 0.5, 1],
    outputRange: [0, 0.04, 0.08, 0.1],
  });

  // Per-radius dash offsets for the inner bevel and outer depth arcs.
  const innerBevelDashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRC_INNER, 0],
  });

  const outerDepthDashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRC_OUTER, 0],
  });

  return (
    <View style={styles.container}>
      <Pressable
        disabled={disabled}
        onPressIn={startHold}
        onPressOut={cancelHold}
        accessibilityRole="button"
        accessibilityLabel="Emergency SOS"
        accessibilityHint={`Press and hold for ${Math.ceil(
          holdDuration / 1000,
        )} seconds. Release to cancel.`}
        accessibilityState={{
          disabled,
          busy: holding,
        }}
        style={[
          styles.pressArea,
          disabled && styles.disabled,
        ]}
      >
        {/* ==========================================================
            3D DIAL HOUSING
            ========================================================== */}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.dialShadow,
            {
              shadowOpacity: dialShadowOpacity,
              transform: [{ scale: dialScale }],
            },
          ]}
        >
          <Svg
            width={DIAL}
            height={DIAL}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Defs>
              <RadialGradient
                id={dialDepthId}
                cx="30%"
                cy="24%"
                r="90%"
              >
                <Stop
                  offset="0%"
                  stopColor="#FFFFFF"
                  stopOpacity="1"
                />

                <Stop
                  offset="38%"
                  stopColor="#F9FBFC"
                  stopOpacity="1"
                />

                <Stop
                  offset="72%"
                  stopColor="#EDF1F4"
                  stopOpacity="1"
                />

                <Stop
                  offset="100%"
                  stopColor="#DCE3E9"
                  stopOpacity="1"
                />
              </RadialGradient>
            </Defs>

            <Circle
              cx={DIAL / 2}
              cy={DIAL / 2}
              r={DIAL / 2}
              fill={`url(#${dialDepthId})`}
            />
          </Svg>

          {/* ========================================================
              DIAL TOP SPECULAR LIGHT
              ======================================================== */}

          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(255,255,255,0.92)',
              'rgba(255,255,255,0.38)',
              'rgba(255,255,255,0)',
            ]}
            locations={[0, 0.3, 0.78]}
            start={{ x: 0.12, y: 0 }}
            end={{ x: 0.76, y: 0.75 }}
            style={styles.dialSpecular}
          />

          {/* ========================================================
              DIAL LOWER DEPTH
              ======================================================== */}

          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(110,125,138,0)',
              'rgba(110,125,138,0.025)',
              'rgba(105,120,133,0.12)',
            ]}
            start={{ x: 0.5, y: 0.45 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.dialLowerShade}
          />

          {/* Outer bevel */}
          <View
            pointerEvents="none"
            style={styles.dialOuterBevel}
          />

          {/* Inner bevel */}
          <View
            pointerEvents="none"
            style={styles.dialInnerBevel}
          />

          {/* Fine light edge */}
          <View
            pointerEvents="none"
            style={styles.dialLightEdge}
          />
        </Animated.View>

        {/* ==========================================================
            PROGRESS ARC — premium crimson, matches button depth
            ========================================================== */}

        <Svg
          width={SIZE}
          height={SIZE}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Defs>
            {/* Main body: deep burgundy shadow → rich crimson → warm rose highlight */}
            <SvgLinearGradient
              id={gradientId}
              x1="30"
              y1="210"
              x2="210"
              y2="30"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0%"   stopColor="#3A0810" />
              <Stop offset="22%"  stopColor="#6B1020" />
              <Stop offset="48%"  stopColor="#9C1C2C" />
              <Stop offset="72%"  stopColor="#BE2C3C" />
              <Stop offset="100%" stopColor="#D44858" />
            </SvgLinearGradient>

            {/* Specular: warm blush highlight, brightest toward top-right (lit zone) */}
            <SvgLinearGradient
              id={arcHighlightId}
              x1="40"
              y1="200"
              x2="200"
              y2="40"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0"    />
              <Stop offset="28%"  stopColor="#FFC8BE" stopOpacity="0.38" />
              <Stop offset="60%"  stopColor="#FFB0A2" stopOpacity="0.14" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0"    />
            </SvgLinearGradient>
          </Defs>

          {/* Recessed track groove — always visible, shows where arc will fill */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="#2A0408"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="butt"
            fill="none"
            opacity={0.18}
          />

          {/* Ambient glow bloom beneath the arc */}
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={`url(#${gradientId})`}
            strokeWidth={STROKE_WIDTH + 10}
            strokeLinecap="butt"
            fill="none"
            opacity={arcGlowOpacity}
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
            rotation="-90"
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />

          {/* Main crimson arc body */}
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={`url(#${gradientId})`}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="butt"
            fill="none"
            opacity={progressOpacity}
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
            rotation="-90"
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />

          {/* Outer depth edge — darkens the outermost rim, like the button outer-rim */}
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={ARC_OUTER_R}
            stroke="rgba(0,0,0,0.28)"
            strokeWidth={4}
            strokeLinecap="butt"
            fill="none"
            opacity={progressOpacity}
            strokeDasharray={`${CIRC_OUTER} ${CIRC_OUTER}`}
            strokeDashoffset={outerDepthDashOffset}
            rotation="-90"
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />

          {/* Inner bevel highlight — warm blush on the inner ridge, like button inner bevel */}
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={ARC_INNER_R}
            stroke={`url(#${arcHighlightId})`}
            strokeWidth={5}
            strokeLinecap="butt"
            fill="none"
            opacity={progressOpacity}
            strokeDasharray={`${CIRC_INNER} ${CIRC_INNER}`}
            strokeDashoffset={innerBevelDashOffset}
            rotation="-90"
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />

          {/* Top-surface glint — very thin specular sheen across the body */}
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={`url(#${arcHighlightId})`}
            strokeWidth={STROKE_WIDTH * 0.55}
            strokeLinecap="butt"
            fill="none"
            opacity={progressOpacity}
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
            rotation="-90"
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>

        {/* ==========================================================
            3D SOS BUTTON
            ========================================================== */}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.buttonShadow,
            {
              shadowOpacity: buttonShadowOpacity,
              transform: [{ scale: buttonScale }],
            },
          ]}
        >
          <Svg
            width={BUTTON}
            height={BUTTON}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Defs>
              {/* Main curved button surface */}
              <RadialGradient
                id={buttonSurfaceId}
                cx="32%"
                cy="22%"
                r="78%"
              >
                <Stop
                  offset="0%"
                  stopColor={holding ? '#F75B57' : '#FF7777'}
                />

                <Stop
                  offset="32%"
                  stopColor={holding ? '#ED4745' : '#F95B5D'}
                />

                <Stop
                  offset="66%"
                  stopColor={holding ? '#D32D34' : '#E33D42'}
                />

                <Stop
                  offset="88%"
                  stopColor={holding ? '#B31F27' : '#C82D34'}
                />

                <Stop
                  offset="100%"
                  stopColor={holding ? '#94161F' : '#AF2028'}
                />
              </RadialGradient>

              {/* Inset material gradient */}
              <RadialGradient
                id={buttonInsetId}
                cx="50%"
                cy="48%"
                r="54%"
              >
                <Stop
                  offset="0%"
                  stopColor="#430000"
                  stopOpacity="0"
                />

                <Stop
                  offset="62%"
                  stopColor="#430000"
                  stopOpacity="0"
                />

                <Stop
                  offset="77%"
                  stopColor="#420000"
                  stopOpacity="0.1"
                />

                <Stop
                  offset="89%"
                  stopColor="#360000"
                  stopOpacity="0.27"
                />

                <Stop
                  offset="98%"
                  stopColor="#260000"
                  stopOpacity="0.5"
                />

                <Stop
                  offset="100%"
                  stopColor="#180000"
                  stopOpacity="0.65"
                />
              </RadialGradient>
            </Defs>

            {/* Main 3D surface */}
            <Circle
              cx={BUTTON / 2}
              cy={BUTTON / 2}
              r={BUTTON / 2}
              fill={`url(#${buttonSurfaceId})`}
            />

            {/* Lower inner depth */}
            <AnimatedCircle
              cx={BUTTON / 2}
              cy={BUTTON / 2}
              r={BUTTON / 2 - 1}
              fill={`url(#${buttonInsetId})`}
              opacity={insetShadowOpacity}
            />
          </Svg>

          {/* ========================================================
              BUTTON SPECULAR HIGHLIGHT
              ======================================================== */}

          <Animated.View
            pointerEvents="none"
            style={[
              styles.buttonSpecular,
              {
                opacity: specularOpacity,
              },
            ]}
          >
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.48)',
                'rgba(255,255,255,0.16)',
                'rgba(255,255,255,0)',
              ]}
              locations={[0, 0.26, 0.72]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.72, y: 0.72 }}
              style={styles.specularGradient}
            />
          </Animated.View>

          {/* Narrow highlight band */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.buttonHighlightBand,
              {
                opacity: specularOpacity,
              },
            ]}
          />

          {/* Physical inner bevel */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.buttonInnerBevel,
              {
                opacity: rimOpacity,
              },
            ]}
          />

          {/* Fine outer rim */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.buttonOuterRim,
              {
                opacity: rimOpacity,
              },
            ]}
          />

          {/* ========================================================
              CONTENT
              ======================================================== */}

          <Text style={styles.sosText}>
            {holding && remaining > 0
              ? remaining
              : 'SOS'}
          </Text>

          <Text style={styles.instruction}>
            {holding
              ? 'KEEP HOLDING'
              : 'HOLD TO ALERT'}
          </Text>
        </Animated.View>
      </Pressable>

      {/* ============================================================
          STATUS
          ============================================================ */}

      <View
        style={styles.statusArea}
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.statusText}>
          {disabled
            ? 'SOS is currently unavailable'
            : holding
              ? 'Release to cancel'
              : `Press and hold for ${Math.ceil(
                  holdDuration / 1000,
                )} seconds`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  pressArea: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SIZE / 2,
  },

  disabled: {
    opacity: 0.42,
  },

  /* ================================================================
     3D DIAL
     ================================================================ */

  dialShadow: {
    position: 'absolute',

    width: DIAL,
    height: DIAL,

    borderRadius: DIAL / 2,

    backgroundColor: '#E9EEF2',

    shadowColor: '#8795A3',
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowRadius: 27,

    elevation: 11,

    overflow: 'hidden',
  },

  dialSpecular: {
    position: 'absolute',

    left: 0,
    top: 0,
    right: 0,
    bottom: 0,

    borderRadius: DIAL / 2,
  },

  dialLowerShade: {
    position: 'absolute',

    left: 0,
    top: 0,
    right: 0,
    bottom: 0,

    borderRadius: DIAL / 2,
  },

  dialOuterBevel: {
    position: 'absolute',

    left: 1,
    right: 1,
    top: 1,
    bottom: 1,

    borderRadius: DIAL / 2,

    borderWidth: 1,

    borderColor: 'rgba(255,255,255,0.95)',
  },

  dialInnerBevel: {
    position: 'absolute',

    left: 5,
    right: 5,
    top: 5,
    bottom: 5,

    borderRadius: DIAL / 2,

    borderWidth: 1,

    borderColor: 'rgba(168,181,193,0.16)',
  },

  dialLightEdge: {
    position: 'absolute',

    left: 7,
    right: 7,
    top: 7,
    bottom: 7,

    borderRadius: DIAL / 2,

    borderWidth: 1,

    borderColor: 'rgba(255,255,255,0.48)',
  },

  /* ================================================================
     3D BUTTON
     ================================================================ */

  buttonShadow: {
    width: BUTTON,
    height: BUTTON,

    borderRadius: BUTTON / 2,

    backgroundColor: '#FFFFFF',

    shadowColor: '#8E2229',

    shadowOffset: {
      width: 0,
      height: 10,
    },

    shadowRadius: 20,

    elevation: 12,

    overflow: 'hidden',

    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonSpecular: {
    position: 'absolute',

    left: 0,
    top: 0,
    right: 0,

    height: BUTTON * 0.72,

    borderRadius: BUTTON / 2,

    overflow: 'hidden',
  },

  specularGradient: {
    flex: 1,
    borderRadius: BUTTON / 2,
  },

  buttonHighlightBand: {
    position: 'absolute',

    left: 15,
    right: 27,
    top: 8,

    height: 13,

    borderRadius: 10,

    backgroundColor: 'rgba(255,255,255,0.18)',

    transform: [
      {
        rotate: '-14deg',
      },
    ],
  },

  buttonInnerBevel: {
    position: 'absolute',

    left: 3,
    right: 3,
    top: 3,
    bottom: 3,

    borderRadius: BUTTON / 2,

    borderWidth: 1.2,

    borderColor: 'rgba(255,255,255,0.28)',
  },

  buttonOuterRim: {
    position: 'absolute',

    left: 1,
    right: 1,
    top: 1,
    bottom: 1,

    borderRadius: BUTTON / 2,

    borderWidth: 1,

    borderColor: 'rgba(255,255,255,0.44)',
  },

  /* ================================================================
     TYPOGRAPHY
     ================================================================ */

  sosText: {
    fontSize: 32,

    lineHeight: 39,

    fontWeight: '900',

    letterSpacing: 1,

    color: '#FFFFFF',

    includeFontPadding: false,

    textShadowColor: 'rgba(75,0,0,0.2)',

    textShadowOffset: {
      width: 0,
      height: 1,
    },

    textShadowRadius: 2,
  },

  instruction: {
    marginTop: 5,

    fontSize: 9.5,

    lineHeight: 13,

    fontWeight: '800',

    letterSpacing: 1.3,

    color: 'rgba(255,255,255,0.94)',

    includeFontPadding: false,
  },

  /* ================================================================
     STATUS
     ================================================================ */

  statusArea: {
    minHeight: 34,

    alignItems: 'center',
    justifyContent: 'center',

    paddingTop: 16,
    paddingHorizontal: 12,
  },

  statusText: {
    fontSize: 13,

    lineHeight: 18,

    fontWeight: '600',

    color: '#8B949E',

    textAlign: 'center',
  },
});

