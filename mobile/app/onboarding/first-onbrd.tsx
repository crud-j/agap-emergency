import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { OnboardProgressbar } from '../../src/components/ui/onbrd-progressbar';

// SVG logo — imported as a React component via react-native-svg-transformer.
// Falls back to the PNG if the transformer hasn't been applied yet (first cold start).
import AgapLogoSvg from '../../assets/icons/agap-svg-icon.svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Original SVG canvas: 209 × 50
const LOGO_W = 209;
const LOGO_H = 50;

const isSvgComponent = typeof AgapLogoSvg === 'function' || (typeof AgapLogoSvg === 'object' && AgapLogoSvg !== null);

function AgapLogo() {
  if (isSvgComponent) {
    const Logo = AgapLogoSvg as React.ComponentType<{ width: number; height: number }>;
    return <Logo width={LOGO_W} height={LOGO_H} />;
  }
  // Fallback: PNG (rendered until transformer is active after metro restart)
  return (
    <Image
      source={require('../../assets/icons/agap-icon.png')}
      style={{ width: LOGO_W, height: LOGO_H }}
      resizeMode="contain"
    />
  );
}

function ContinueButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Continue"
    >
      <LinearGradient
        // Base teal with a white highlight band near the top
        colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', '#0A5448']}
        locations={[0, 0.38, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.continueButton}
      >
        <Text style={styles.continueText}>Continue</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.container}>
        {/* ── Top bar: dots centered, Skip pinned right ── */}
        <View style={styles.topBar}>
          <OnboardProgressbar currentStep={1} totalSteps={4} />
          <TouchableOpacity
            onPress={() => router.push('/auth/login')}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            style={styles.skipButton}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* ── AGAP logo ── */}
        <View style={styles.logoBlock}>
          <AgapLogo />
        </View>

        {/* ── Illustration ── */}
        <Image
          source={require('../../assets/onboardingassets/Onbrd-1-vec.png')}
          style={styles.illustration}
          resizeMode="contain"
        />

        {/* ── Heading & body ── */}
        <View style={styles.copyBlock}>
          <Text style={styles.heading}>{'Get Help When\nYou Need it.'}</Text>
          <Text style={styles.body}>
            In an emergency, your call matters. AGAP connects you with trained
            responders and helps ensure you get the care you need, faster.
          </Text>
        </View>

        {/* ── Continue button pinned to bottom ── */}
        <View style={styles.buttonBlock}>
          <ContinueButton onPress={() => router.push('/onboarding/second-onbrd')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  // ── Top bar ──────────────────────────────────────────────
  topBar: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    marginBottom: 24,
  },
  skipButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 15,
    color: '#0D6053',
    fontWeight: '600',
  },

  // ── Logo ─────────────────────────────────────────────────
  logoBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },

  // ── Illustration ──────────────────────────────────────────
  illustration: {
    width: SCREEN_WIDTH - 40,
    height: (SCREEN_WIDTH - 40) * 0.72,
    alignSelf: 'center',
    marginBottom: 28,
  },

  // ── Copy block ───────────────────────────────────────────
  copyBlock: {
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 32,
  },
  heading: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#0D3B3B',
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 14,
  },
  body: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: '88%',
  },

  // ── Continue button ──────────────────────────────────────
  buttonBlock: {
    paddingHorizontal: 4,
    paddingBottom: 28,   // lifted — breathing room above safe-area edge
    marginTop: 'auto',
  },
  continueButton: {
    width: '100%',
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    // Base teal sits behind the gradient; gradient overlay provides the highlight
    backgroundColor: '#0D6053',
    overflow: 'hidden',
  },
  continueText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
