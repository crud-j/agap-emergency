import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslations } from '../../hooks/useAccessibility';
import { SoundSource } from '../../hooks/useSOSAudio';
import { HoldToSOS } from './HoldToSOS';
import { useIncidentStore } from '../../stores/incident.store';
import { useAccessibilityStore } from '../../stores/accessibility.store';
import { useShakeToAlert } from '../../hooks/useShakeToAlert';
import { ShakeCountdown } from './ShakeCountdown';

/**
 * Looping alert sound played while the SOS button is held.
 *
 * To enable audio:
 *   1. Place your alert MP3 at:  mobile/assets/sounds/sos-alert.mp3
 *      (e.g. download the "emergency meeting" sound from myinstants.com)
 *   2. Replace the null below with:
 *        require('@/assets/sounds/sos-alert.mp3') as AVPlaybackSource
 *
 * Until the file is added, haptic + vibration feedback still fires.
 */
const SOS_SOUND_SOURCE: SoundSource = require('@/assets/sounds/sos-alert.mp3');

type CircleLoaderProps = {
  progress: number; // 0 to 1
  size?: number;
  strokeWidth?: number;
  reducedMotion?: boolean;
};

export function CircleLoader({
  progress,
  size = 150,
  strokeWidth = 9,
}: CircleLoaderProps) {
  const center = size / 2;
  const radius = center - strokeWidth * 2;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient
            id="sosGradient"
            x1="0%"
            y1="100%"
            x2="100%"
            y2="0%"
          >
            <Stop offset="0%" stopColor="#00C878" />
            <Stop offset="45%" stopColor="#22E66B" />
            <Stop offset="100%" stopColor="#8BFF4D" />
          </LinearGradient>
        </Defs>

        {/* Soft outer track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#E8F5EC"
          strokeWidth={strokeWidth + 5}
          fill="none"
        />

        {/* Inner track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#CDEBD7"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Diffused progress glow */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#22E66B"
          strokeWidth={strokeWidth + 9}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          fill="none"
          opacity={0.16}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${center}, ${center}`}
        />

        {/* Premium gradient progress arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#sosGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          fill="none"
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
    </View>
  );
}

/**
 * Home-screen SOS alert block: the large press-and-hold SOS button (or a
 * "view active incident" shortcut when one is in progress), plus the heading,
 * body copy, and the shake-to-alert status chip.
 */
export default function SOSAlert({
  hasActiveIncident,
  reducedMotion,
  shakeToAlert: shakeToAlertProp,
  onShakeToAlertChange,
}: {
  hasActiveIncident: boolean;
  reducedMotion: boolean;
  shakeToAlert?: boolean;
  onShakeToAlertChange?: (value: boolean) => void;
}) {
  const router = useRouter();
  const t = useTranslations();
  const startSOS = useIncidentStore((s) => s.startSOS);
  const activeIncidentId = useIncidentStore((s) => s.activeIncidentId);
  const storedShakeToAlert = useAccessibilityStore((s) => s.shakeToAlert);
  const shakeToAlert = shakeToAlertProp ?? storedShakeToAlert;
  const [countdownVisible, setCountdownVisible] = React.useState(false);
  const shakeEnabled = shakeToAlert;

  const handleShake = React.useCallback(() => {
    setCountdownVisible(true);
  }, []);

  useShakeToAlert({
    enabled: shakeToAlert,
    hasActiveIncident,
    onShake: handleShake,
  });

  function handleHoldComplete() {
    // Capture location first (step 1 — "Confirm Location"): a precise position is
    // the most time-critical thing responders need. GPS is still optional, so the
    // screen always lets the reporter continue into the rest of the flow.
    startSOS();
    router.push('/emergency/location' as never);
  }

  const sendShakeAlert = React.useCallback(() => {
    setCountdownVisible(false);
    startSOS('SHAKE_GESTURE');
    router.push('/emergency/location' as never);
  }, [router, startSOS]);

  function toggleShake() {
    if (onShakeToAlertChange) {
      onShakeToAlertChange(!shakeToAlert);
      return;
    }
    void useAccessibilityStore.getState().setPreferences({ shakeToAlert: !shakeToAlert });
  }

  return (
    <View style={styles.sosSection}>
      <ShakeCountdown visible={countdownVisible} onCancel={() => setCountdownVisible(false)} onSend={sendShakeAlert} />
      {hasActiveIncident ? (
        <TouchableOpacity
          style={styles.viewActiveBtn}
          onPress={() =>
            router.push((activeIncidentId ? `/incidents/${activeIncidentId}` : '/incidents') as never)
          }
        >
          <ExpoLinearGradient
            colors={['#0D6053', '#0A5448']}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={styles.gradientOverlay}
          >
            <Ionicons name="pulse-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.viewActiveBtnText}>{t.home.sosViewActive}</Text>
          </ExpoLinearGradient>
        </TouchableOpacity>
      ) : (
        <HoldToSOS
          duration={3000}
          reducedMotion={reducedMotion}
          onComplete={handleHoldComplete}
          soundSource={SOS_SOUND_SOURCE}
        />
      )}

      <Text style={styles.sosHeading}>{t.home.sosHeading}</Text>
      <Text style={styles.sosBody}>{t.home.sosBody}</Text>

      <TouchableOpacity
        style={styles.shakeChip}
        activeOpacity={0.7}
        onPress={toggleShake}
        accessibilityRole="switch"
        accessibilityState={{ checked: shakeEnabled }}
      >
        <Ionicons name="phone-portrait-outline" size={14} color={shakeEnabled ? '#0D6053' : '#9CA3AF'} style={{ marginRight: 6 }} />
        <Text style={[styles.shakeChipText, { color: shakeEnabled ? '#0D6053' : '#9CA3AF' }]}>
          {shakeEnabled ? t.home.shakeOn : t.home.shakeOff}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  sosSection: { alignItems: 'center', marginBottom: 32, paddingTop: 4, paddingBottom: 12 },
  viewActiveBtn: { width: '100%', minHeight: 56, marginBottom: 20, borderRadius: 16, overflow: 'hidden' },
  gradientOverlay: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  viewActiveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  sosHeading: {
    marginTop: 4, marginBottom: 8, fontSize: 26, lineHeight: 32, fontWeight: '900',
    color: '#162B36', textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  sosBody: {
    maxWidth: 320, marginBottom: 16, paddingHorizontal: 8, fontSize: 15, lineHeight: 23,
    fontWeight: '700', color: '#29434D', textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  shakeChip: { minHeight: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: '#EDF1F4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  shakeChipText: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
});
